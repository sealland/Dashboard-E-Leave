import { Router } from "express";
import { getPool, sql } from "../db.js";

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
      database: process.env.DB_DATABASE || "INFO",
      source: "vw_employee_checkin",
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
    });
  }
});

router.get("/attendance", async (req, res) => {
  const { from, to, branch, department } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("from", sql.Date, from);
    request.input("to", sql.Date, to);
    request.input("branch", sql.NVarChar(50), branch || null);
    request.input("department", sql.NVarChar(200), department || null);

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
      ORDER BY TMR_DATE, EMP_KEY, DF_CODE
    `);

    const rows = result.recordset.map(normalizeRow);

    res.json({
      rows,
      meta: { from, to, branch: branch || null, department: department || null, count: rows.length },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
