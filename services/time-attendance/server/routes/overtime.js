import { Router } from "express";
import { getPool, sql } from "../db.js";
import { OT_DF_CODES } from "../../shared/df-code-map.js";
import { buildWeeklyOver36Summaries } from "../../shared/weekly-over36.js";
import { buildAuthSql, buildHeadcountAuthSql, requireReportAuth, REPORT_TIME_ATTENDANCE } from "../auth.js";

const router = Router();

function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
    } else if (value === null || value === undefined) {
      normalized[key] = "";
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

router.get("/overtime", async (req, res) => {
  const { from, to, df_code: dfCode, branch, department, c } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  const codes = dfCode && dfCode !== "all" ? [String(dfCode)] : [...OT_DF_CODES];

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

    const codeParams = codes.map((_, index) => `@df${index}`).join(", ");
    codes.forEach((code, index) => {
      request.input(`df${index}`, sql.NVarChar(10), code);
    });
    const authSql = buildAuthSql(request, auth, { includeBranch: true });

    const result = await request.query(`
      SELECT
        PRS_NO, EMP_KEY, EMP_NAME, EMP_SURNME,
        DEPT_CODE, DEPT_THAIDESC,
        BR_CODE, BR_THAIDESC,
        TMR_DATE,
        DF_CODE, DF_DESC,
        TMR_QTY_T
      FROM [dbo].[vw_employee_checkin]
      WHERE TMR_DATE >= @from AND TMR_DATE <= @to
        AND DF_CODE IN (${codeParams})
        AND (@branch IS NULL OR BR_CODE = @branch)
        AND (@department IS NULL OR DEPT_CODE = @department)
        ${authSql}
      ORDER BY BR_CODE, DEPT_CODE, PRS_NO, TMR_DATE, DF_CODE
    `);

    const rows = result.recordset.map(normalizeRow);

    res.json({
      rows,
      meta: {
        from,
        to,
        df_code: dfCode || "all",
        df_codes: codes,
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

/**
 * Real headcount as of `to` from ZHR_EMPLOYEE (pri_start_d / PRI_RES_D),
 * with BR/DEPT from latest checkin — not limited to people who already did OT.
 */
router.get("/overtime/headcount", async (req, res) => {
  const { to, c } = req.query;
  if (!to) {
    res.status(400).json({ error: "to is required (YYYY-MM-DD)" });
    return;
  }

  try {
    const auth = await requireReportAuth(req, res, REPORT_TIME_ATTENDANCE, { c });
    if (!auth) return;

    const pool = await getPool();
    const request = pool.request();
    request.input("to", sql.Date, to);
    const headcountAuthSql = buildHeadcountAuthSql(request, auth, { alias: "loc" });

    const result = await request.query(`
      WITH latest_checkin AS (
        SELECT
          LTRIM(RTRIM(CAST(c.PRS_NO AS NVARCHAR(50)))) AS prs_no,
          c.EMP_KEY,
          c.BR_CODE,
          c.DEPT_CODE,
          ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(CAST(c.PRS_NO AS NVARCHAR(50))))
            ORDER BY c.TMR_DATE DESC
          ) AS rn
        FROM dbo.vw_employee_checkin c
        WHERE c.TMR_DATE <= @to
          AND c.PRS_NO IS NOT NULL
          AND LTRIM(RTRIM(CAST(c.PRS_NO AS NVARCHAR(50)))) <> ''
      )
      SELECT
        LTRIM(RTRIM(CAST(e.emp_code AS NVARCHAR(50)))) AS emp_code,
        loc.EMP_KEY,
        LTRIM(RTRIM(CAST(loc.BR_CODE AS NVARCHAR(50)))) AS BR_CODE,
        LTRIM(RTRIM(CAST(loc.DEPT_CODE AS NVARCHAR(50)))) AS DEPT_CODE
      FROM dbo.ZHR_EMPLOYEE e
      LEFT JOIN latest_checkin loc
        ON loc.rn = 1
       AND (
            loc.prs_no = LTRIM(RTRIM(CAST(e.emp_code AS NVARCHAR(50))))
            OR (
              TRY_CAST(loc.prs_no AS BIGINT) IS NOT NULL
              AND TRY_CAST(e.emp_code AS BIGINT) IS NOT NULL
              AND TRY_CAST(loc.prs_no AS BIGINT) = TRY_CAST(e.emp_code AS BIGINT)
            )
          )
      WHERE e.emp_code IS NOT NULL
        AND LTRIM(RTRIM(e.emp_code)) <> ''
        AND e.pri_start_d IS NOT NULL
        AND e.pri_start_d <= @to
        AND (e.PRI_RES_D IS NULL OR e.PRI_RES_D > @to)
        ${headcountAuthSql}
    `);

    function normalizeBranch(value) {
      const code = String(value || "").trim();
      if (code === "998" || code === "999" || code === "MMT") return "MMT";
      return code;
    }

    function inAuthScope(branchCode, deptCode) {
      if (!auth.has_all_dept) {
        if (!auth.departments?.length) return false;
        if (!deptCode || !auth.departments.includes(deptCode)) return false;
      }
      if (!auth.has_all_branch && auth.branches?.length) {
        const allowed = new Set(auth.branches.map(normalizeBranch));
        if (!branchCode || !allowed.has(branchCode)) return false;
      }
      return true;
    }

    const branches = new Map();
    const departments = new Map();
    const all = new Set();

    for (const row of result.recordset) {
      const empId = String(row.EMP_KEY ?? row.emp_code ?? "").trim();
      if (!empId) continue;
      const branchCode = normalizeBranch(row.BR_CODE);
      const deptCode = String(row.DEPT_CODE || "").trim();

      if (!inAuthScope(branchCode, deptCode)) continue;

      all.add(empId);

      if (branchCode) {
        if (!branches.has(branchCode)) {
          branches.set(branchCode, new Set());
        }
        branches.get(branchCode).add(empId);
      }

      if (deptCode) {
        if (!departments.has(deptCode)) {
          departments.set(deptCode, { branchCode: branchCode || "", employees: new Set() });
        }
        const dept = departments.get(deptCode);
        dept.employees.add(empId);
        if (branchCode && !dept.branchCode) dept.branchCode = branchCode;
      }
    }

    res.json({
      totalEmployees: all.size,
      branches: [...branches.entries()]
        .map(([code, employees]) => ({
          code,
          name: code,
          totalEmployees: employees.size,
        }))
        .sort((a, b) => a.code.localeCompare(b.code, "th")),
      departments: [...departments.entries()]
        .map(([code, item]) => ({
          code,
          name: code,
          branchCode: item.branchCode,
          totalEmployees: item.employees.size,
        }))
        .sort((a, b) => a.code.localeCompare(b.code, "th")),
      meta: {
        asOf: to,
        source: "ZHR_EMPLOYEE",
        location: "latest vw_employee_checkin BR/DEPT",
        auth,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * คน / ปริมาณเหล็ก (ZHR_PP) / ชม.OT รายเดือน + อัตราส่วน productivity
 * ขอบเขตแผนก: แผนกที่มีใน ZHR_PP (หรือ filter department ถ้าระบุ)
 */
router.get("/overtime/pp-productivity", async (req, res) => {
  const { from, to, df_code: dfCode, department, c } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  const codes = dfCode && dfCode !== "all" ? [String(dfCode)] : [...OT_DF_CODES];

  try {
    const auth = await requireReportAuth(req, res, REPORT_TIME_ATTENDANCE, { c });
    if (!auth) {
      return;
    }
    const pool = await getPool();

    const ppReq = pool.request();
    ppReq.input("from", sql.Date, from);
    ppReq.input("to", sql.Date, to);
    ppReq.input("department", sql.NVarChar(200), department && department !== "all" ? department : null);
    const ppAuthSql = buildAuthSql(ppReq, auth, { includeBranch: false });

    const ppResult = await ppReq.query(`
      SELECT
        PP_YEAR AS [year],
        PP_MONTH AS [month],
        SUM(CAST(PP_TON AS float)) AS steel_ton
      FROM dbo.ZHR_PP
      WHERE DATEFROMPARTS(PP_YEAR, PP_MONTH, 1) >= DATEFROMPARTS(YEAR(@from), MONTH(@from), 1)
        AND DATEFROMPARTS(PP_YEAR, PP_MONTH, 1) <= DATEFROMPARTS(YEAR(@to), MONTH(@to), 1)
        AND (@department IS NULL OR DEPT_CODE = @department)
        ${ppAuthSql}
      GROUP BY PP_YEAR, PP_MONTH
      ORDER BY PP_YEAR, PP_MONTH
    `);

    const otReq = pool.request();
    otReq.input("from", sql.Date, from);
    otReq.input("to", sql.Date, to);
    otReq.input("department", sql.NVarChar(200), department && department !== "all" ? department : null);
    const codeParams = codes.map((_, index) => `@df${index}`).join(", ");
    codes.forEach((code, index) => {
      otReq.input(`df${index}`, sql.NVarChar(10), code);
    });
    const otAuthSql = buildAuthSql(otReq, auth, { alias: "c", includeBranch: true });

    const otResult = await otReq.query(`
      SELECT
        YEAR(c.TMR_DATE) AS [year],
        MONTH(c.TMR_DATE) AS [month],
        COUNT(DISTINCT c.EMP_KEY) AS people,
        SUM(CAST(c.TMR_QTY_T AS float)) AS ot_hours
      FROM dbo.vw_employee_checkin c
      WHERE c.TMR_DATE >= @from AND c.TMR_DATE <= @to
        AND c.DF_CODE IN (${codeParams})
        AND (
          (@department IS NOT NULL AND c.DEPT_CODE = @department)
          OR (@department IS NULL AND c.DEPT_CODE IN (SELECT DISTINCT DEPT_CODE FROM dbo.ZHR_PP))
        )
        ${otAuthSql}
      GROUP BY YEAR(c.TMR_DATE), MONTH(c.TMR_DATE)
      ORDER BY YEAR(c.TMR_DATE), MONTH(c.TMR_DATE)
    `);

    const byKey = new Map();

    function ensure(year, month) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          year: Number(year),
          month: Number(month),
          key,
          people: 0,
          steelTon: 0,
          otHours: 0,
        });
      }
      return byKey.get(key);
    }

    for (const row of ppResult.recordset) {
      const item = ensure(row.year, row.month);
      item.steelTon = Number(row.steel_ton) || 0;
    }
    for (const row of otResult.recordset) {
      const item = ensure(row.year, row.month);
      item.people = Number(row.people) || 0;
      item.otHours = Number(row.ot_hours) || 0;
    }

    const months = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));

    const enriched = months.map((m) => {
      const tonPerHr = m.otHours > 0 ? m.steelTon / m.otHours : null;
      const hrPerTon = m.steelTon > 0 ? m.otHours / m.steelTon : null;
      return {
        ...m,
        tonPerHr,
        hrPerTon,
      };
    });

    const n = enriched.length;
    const avg = {
      people: n ? enriched.reduce((s, m) => s + m.people, 0) / n : 0,
      steelTon: n ? enriched.reduce((s, m) => s + m.steelTon, 0) / n : 0,
      otHours: n ? enriched.reduce((s, m) => s + m.otHours, 0) / n : 0,
    };
    avg.tonPerHr = avg.otHours > 0 ? avg.steelTon / avg.otHours : null;
    avg.hrPerTon = avg.steelTon > 0 ? avg.otHours / avg.steelTon : null;

    res.json({
      months: enriched,
      average: avg,
      meta: {
        from,
        to,
        df_code: dfCode || "all",
        department: department && department !== "all" ? department : null,
        source: { steel: "ZHR_PP.PP_TON", ot: "vw_employee_checkin", people: "distinct EMP_KEY with OT" },
        auth,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Employee-week OT totals over 36 hours (Monday–Sunday weeks) within the selected range.
 */
router.get("/overtime/weekly-over-36", async (req, res) => {
  const { from, to, c } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  try {
    const auth = await requireReportAuth(req, res, REPORT_TIME_ATTENDANCE, { c });
    if (!auth) return;

    const pool = await getPool();
    const request = pool.request();
    request.input("from", sql.Date, from);
    request.input("to", sql.Date, to);

    const codeParams = OT_DF_CODES.map((_, index) => `@df${index}`).join(", ");
    OT_DF_CODES.forEach((code, index) => {
      request.input(`df${index}`, sql.NVarChar(10), code);
    });
    const authSql = buildAuthSql(request, auth, { alias: "c", includeBranch: true });

    const result = await request.query(`
      SET DATEFIRST 1;

      WITH base AS (
        SELECT
          LTRIM(RTRIM(CAST(c.PRS_NO AS NVARCHAR(50)))) AS prs_no,
          LTRIM(RTRIM(CAST(c.EMP_KEY AS NVARCHAR(50)))) AS emp_key,
          LTRIM(RTRIM(CAST(c.EMP_NAME AS NVARCHAR(200)))) AS emp_name,
          LTRIM(RTRIM(CAST(c.EMP_SURNME AS NVARCHAR(200)))) AS emp_surname,
          LTRIM(RTRIM(CAST(c.DEPT_CODE AS NVARCHAR(100)))) AS dept_code,
          LTRIM(RTRIM(CAST(c.DEPT_THAIDESC AS NVARCHAR(200)))) AS dept_name,
          LTRIM(RTRIM(CAST(c.BR_CODE AS NVARCHAR(100)))) AS branch_code,
          LTRIM(RTRIM(CAST(c.BR_THAIDESC AS NVARCHAR(200)))) AS branch_name,
          CAST(c.TMR_DATE AS date) AS work_date,
          CAST(c.TMR_QTY_T AS float) AS ot_hours,
          DATEADD(day, 1 - DATEPART(weekday, c.TMR_DATE), CAST(c.TMR_DATE AS date)) AS week_start,
          DATEADD(day, 7 - DATEPART(weekday, c.TMR_DATE), CAST(c.TMR_DATE AS date)) AS week_end
        FROM dbo.vw_employee_checkin c
        WHERE c.TMR_DATE >= @from
          AND c.TMR_DATE <= @to
          AND c.DF_CODE IN (${codeParams})
          ${authSql}
      ),
      grouped AS (
        SELECT
          week_start,
          week_end,
          prs_no,
          emp_key,
          MAX(emp_name) AS emp_name,
          MAX(emp_surname) AS emp_surname,
          MAX(dept_code) AS dept_code,
          MAX(dept_name) AS dept_name,
          MAX(branch_code) AS branch_code,
          MAX(branch_name) AS branch_name,
          SUM(ot_hours) AS total_hours,
          COUNT(DISTINCT work_date) AS day_count
        FROM base
        GROUP BY week_start, week_end, prs_no, emp_key
        HAVING SUM(ot_hours) > 36
      )
      SELECT
        CONVERT(varchar(10), week_start, 23) AS week_start,
        CONVERT(varchar(10), week_end, 23) AS week_end,
        CONVERT(varchar(10), week_start, 23) AS week_key,
        prs_no,
        emp_key,
        LTRIM(RTRIM(CONCAT(COALESCE(emp_name, ''), ' ', COALESCE(emp_surname, '')))) AS employee_name,
        dept_code,
        dept_name,
        branch_code,
        branch_name,
        total_hours,
        day_count
      FROM grouped
      ORDER BY week_start DESC, total_hours DESC, employee_name ASC;
    `);

    const rows = result.recordset.map((row) => ({
      weekKey: row.week_key,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      prsNo: row.prs_no || "",
      empKey: row.emp_key || "",
      employeeName: row.employee_name || "",
      departmentCode: row.dept_code || "",
      departmentName: row.dept_name || "",
      branchCode: row.branch_code || "",
      branchName: row.branch_name || "",
      totalHours: Number(row.total_hours) || 0,
      dayCount: Number(row.day_count) || 0,
    }));

    const weeks = buildWeeklyOver36Summaries(rows);

    res.json({
      weeks,
      rows,
      meta: {
        from,
        to,
        thresholdHours: 36,
        weekStartsOn: "monday",
        auth,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
