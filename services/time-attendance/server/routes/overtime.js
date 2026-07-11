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

export default router;
