import { Router } from "express";
import { getPool, sql } from "../db.js";
import { OT_DF_CODES } from "../../shared/df-code-map.js";

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
  const { from, to, df_code: dfCode, branch, department } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  const codes = dfCode && dfCode !== "all" ? [String(dfCode)] : [...OT_DF_CODES];

  try {
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
  const { from, to, df_code: dfCode, department } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  const codes = dfCode && dfCode !== "all" ? [String(dfCode)] : [...OT_DF_CODES];

  try {
    const pool = await getPool();

    const ppReq = pool.request();
    ppReq.input("from", sql.Date, from);
    ppReq.input("to", sql.Date, to);
    ppReq.input("department", sql.NVarChar(200), department && department !== "all" ? department : null);

    const ppResult = await ppReq.query(`
      SELECT
        PP_YEAR AS [year],
        PP_MONTH AS [month],
        SUM(CAST(PP_TON AS float)) AS steel_ton
      FROM dbo.ZHR_PP
      WHERE DATEFROMPARTS(PP_YEAR, PP_MONTH, 1) >= DATEFROMPARTS(YEAR(@from), MONTH(@from), 1)
        AND DATEFROMPARTS(PP_YEAR, PP_MONTH, 1) <= DATEFROMPARTS(YEAR(@to), MONTH(@to), 1)
        AND (@department IS NULL OR DEPT_CODE = @department)
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
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
