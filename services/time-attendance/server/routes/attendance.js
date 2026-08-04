import { Router } from "express";
import { getPool, sql } from "../db.js";
import { buildAuthSql, getAuthorization, requireReportAuth, REPORT_TIME_ATTENDANCE } from "../auth.js";

const router = Router();

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const day = value.getDate();
    const month = value.getMonth() + 1;
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }
  const text = String(value).trim();
  if (text.includes("T")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    }
  }
  return text;
}

function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "TMR_DATE" || key === "TMT_DATE") {
      normalized[key] = normalizeDate(value);
    } else if (key === "PRS_NO" || key === "EMP_KEY") {
      // Keep as string so codes are never truncated by numeric JSON types
      normalized[key] = value == null ? "" : String(value).trim();
    } else if (value instanceof Date) {
      normalized[key] = value.toISOString();
    } else if (value === null || value === undefined) {
      normalized[key] = "";
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

router.get("/health", async (_req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query("SELECT TOP 1 EMP_KEY FROM [dbo].[vw_employee_checkin]");
    res.json({
      ok: true,
      database: process.env.DB_DATABASE || process.env.DB_NAME || "INFO",
      source: "vw_employee_checkin",
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
    });
  }
});

router.get("/auth", async (req, res) => {
  try {
    const auth = await getAuthorization(req.query.c);
    res.json(auth);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/branch-codes", async (req, res) => {
  try {
    const auth = await requireReportAuth(req, res, REPORT_TIME_ATTENDANCE);
    if (!auth) return;

    const pool = await getPool();
    let branchCodes = [];

    async function listAllBranches() {
      const queries = [
        `
          SELECT BR_CODE
          FROM dbo.vw_employee_checkin
          WHERE BR_CODE IS NOT NULL
            AND LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(50)))) <> ''
            AND UPPER(LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(50))))) <> 'ALL'
          GROUP BY BR_CODE
          ORDER BY BR_CODE
        `,
        `
          SELECT BR_CODE
          FROM dbo.vw_empcheck
          WHERE BR_CODE IS NOT NULL
            AND LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(50)))) <> ''
            AND UPPER(LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(50))))) <> 'ALL'
          GROUP BY BR_CODE
          ORDER BY BR_CODE
        `,
      ];
      let lastError = null;
      for (const sqlText of queries) {
        try {
          const result = await pool.request().query(sqlText);
          return result.recordset
            .map((row) => String(row.BR_CODE ?? "").trim())
            .filter(Boolean);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Unable to list branches");
    }

    if (auth.has_all_branch) {
      branchCodes = await listAllBranches();
    } else if (auth.branches?.length) {
      branchCodes = auth.branches
        .map((code) => String(code ?? "").trim())
        .filter((code) => code && code.toUpperCase() !== "ALL");
    } else {
      const selfBr = await pool
        .request()
        .input("prs_no", sql.NVarChar(50), auth.prs_no)
        .query(`
          SELECT DISTINCT BR_CODE
          FROM dbo.vw_employee_checkin
          WHERE LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = @prs_no
            AND BR_CODE IS NOT NULL
            AND LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(50)))) <> ''
            AND UPPER(LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(50))))) <> 'ALL'
          ORDER BY BR_CODE
        `);
      branchCodes = selfBr.recordset
        .map((row) => String(row.BR_CODE ?? "").trim())
        .filter(Boolean);
    }

    res.json({
      ok: true,
      data: branchCodes,
      meta: {
        has_all_branch: Boolean(auth.has_all_branch),
        count: branchCodes.length,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/attendance", async (req, res) => {
  const { from, to, branch, department, c } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  try {
    const auth = await requireReportAuth(req, res, REPORT_TIME_ATTENDANCE, { c });
    if (!auth) {
      return;
    }
    const pool = await getPool();
    const request = pool.request();
    request.input("from", sql.Date, from);
    request.input("to", sql.Date, to);
    request.input("branch", sql.NVarChar(50), branch || null);
    request.input("department", sql.NVarChar(200), department || null);
    const authSql = buildAuthSql(request, auth, { includeBranch: true });

    const result = await request.query(`
      SELECT
        PRS_NO, EMP_KEY, EMP_NAME, EMP_SURNME,
        DEPT_CODE, DEPT_THAIDESC,
        BR_CODE, BR_THAIDESC,
        SF_CODE, SF_NAME,
        TMR_DATE, TMT_DATE, TMT_SF,
        TMT_STAMPINFO, TMT_STAMP_IN, TMT_STAMP_OUT,
        DF_CODE, DF_DESC, DF_MONTH_RATE,
        TMR_DF, TMR_QTY, TMR_QTY_T, TMR_QTY_APR,
        TMT_WORK_HOUR, DF_LEAVE
      FROM [dbo].[vw_employee_checkin]
      WHERE TMR_DATE >= @from AND TMR_DATE <= @to
        AND (@branch IS NULL OR BR_CODE = @branch)
        AND (@department IS NULL OR DEPT_CODE = @department)
        ${authSql}
      ORDER BY TMR_DATE, EMP_KEY, DF_CODE
    `);

    const rows = result.recordset.map(normalizeRow);

    res.json({
      rows,
      meta: {
        from,
        to,
        branch: branch || null,
        department: department || null,
        count: rows.length,
        auth,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
