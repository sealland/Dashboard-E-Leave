import { Router } from "express";
import { getPool, sql } from "../db.js";

const router = Router();

const METRIC_DEFS = [
  { id: "sick_cert", label: "ป่วยมีใบรับรองแพทย์", unit: "ชม./คน", kind: "hours" },
  { id: "sick_no", label: "ป่วยไม่มีใบรับรองแพทย์", unit: "ชม./คน", kind: "hours" },
  { id: "business", label: "ลากิจ", unit: "ชม./คน", kind: "hours" },
  { id: "special", label: "ลากิจ(พิเศษ)", unit: "ชม./คน", kind: "hours" },
  { id: "vacation", label: "พักร้อน", unit: "วัน/คน", kind: "days" },
  { id: "absent", label: "ขาดงาน", unit: "ชม./คน", kind: "hours" },
  { id: "late", label: "มาสาย", unit: "ครั้ง/คน", kind: "count" },
  { id: "suspend", label: "พักงาน", unit: "วัน/คน", kind: "days" },
];

/** BU ที่ไม่นำมานับใน EMC (ทั้งคอลัมน์ / headcount / Total) */
const EXCLUDED_BUS = new Set(["BOD", "CEO", "COO", "SUVANA"]);

function monthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function classifyMetric(leaveRaw, dfCodeRaw) {
  const leave = String(leaveRaw ?? "").trim();
  const dfCode = String(dfCodeRaw ?? "").trim();

  if (dfCode === "2100") return "suspend";
  if (dfCode === "2120" || dfCode === "2121") return "late";

  if (leave.includes("ปN")) return "sick_no";
  if (leave.includes("กพ")) return "special";
  if (leave.includes("ข")) return "absent";
  if (leave.includes("ก") && !leave.includes("กก") && !leave.includes("กป")) return "business";
  if (leave.includes("ร") && !leave.includes("รท")) return "vacation";
  if (leave.includes("ป")) return "sick_cert";
  return null;
}

function metricAmount(metricId, row) {
  const qty = Number(row.TMR_QTY) || 0;
  const qtyT = Number(row.TMR_QTY_T) || 0;
  const kind = METRIC_DEFS.find((m) => m.id === metricId)?.kind;

  if (kind === "count") return 1;
  if (metricId === "suspend") return qtyT > 0 ? qtyT : qty / 8;
  if (kind === "days") return qty / 8;
  return qty;
}

router.get("/emc", async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "year is invalid" });
    return;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: "month is invalid (1-12)" });
    return;
  }

  const { from, to } = monthRange(year, month);

  try {
    const pool = await getPool();

    const headcountResult = await pool.request().query(`
      SELECT
        RTRIM(LTRIM(BU)) AS bu,
        COUNT(*) AS headcount
      FROM dbo.tbl_hr_org
      WHERE emp_code IS NOT NULL
        AND LTRIM(RTRIM(emp_code)) <> ''
        AND BU IS NOT NULL
        AND LTRIM(RTRIM(BU)) <> ''
      GROUP BY RTRIM(LTRIM(BU))
      ORDER BY RTRIM(LTRIM(BU))
    `);

    const buses = headcountResult.recordset
      .map((row) => ({
        code: String(row.bu || "").trim(),
        headcount: Number(row.headcount) || 0,
      }))
      .filter((row) => row.code && row.headcount > 0 && !EXCLUDED_BUS.has(row.code))
      .sort((a, b) => a.code.localeCompare(b.code, "en"));

    const totalHeadcount = buses.reduce((sum, bu) => sum + bu.headcount, 0);
    const headcountByBu = Object.fromEntries(buses.map((bu) => [bu.code, bu.headcount]));

    const request = pool.request();
    request.input("from", sql.Date, from);
    request.input("to", sql.Date, to);

    const txResult = await request.query(`
      SELECT
        RTRIM(LTRIM(ISNULL(mapped.BU, ''))) AS bu,
        RTRIM(LTRIM(c.DEPT_CODE)) AS dept_code,
        RTRIM(LTRIM(c.DF_LEAVE)) AS DF_LEAVE,
        c.DF_CODE,
        CAST(c.TMR_QTY AS float) AS TMR_QTY,
        CAST(c.TMR_QTY_T AS float) AS TMR_QTY_T
      FROM dbo.vw_employee_checkin c
      OUTER APPLY (
        SELECT TOP 1 RTRIM(LTRIM(z.BU)) AS BU
        FROM dbo.ZHR_BU z
        WHERE
          (
            NULLIF(LTRIM(RTRIM(z.SEC)), '') IS NOT NULL
            AND LTRIM(RTRIM(z.SEC)) = LTRIM(RTRIM(c.DEPT_CODE))
          )
          OR (
            NULLIF(LTRIM(RTRIM(z.SEC)), '') IS NULL
            AND NULLIF(LTRIM(RTRIM(z.DEP)), '') IS NOT NULL
            AND LTRIM(RTRIM(z.DEP)) = LTRIM(RTRIM(c.DEPT_CODE))
          )
      ) mapped
      WHERE c.TMR_DATE >= @from AND c.TMR_DATE <= @to
        AND (
          c.DF_CODE IN (2100, 2120, 2121)
          OR (
            c.DF_LEAVE IS NOT NULL
            AND LTRIM(RTRIM(c.DF_LEAVE)) <> ''
            AND LTRIM(RTRIM(c.DF_LEAVE)) <> '/'
          )
        )
    `);

    const sumsByMetricBu = Object.fromEntries(
      METRIC_DEFS.map((metric) => [metric.id, Object.create(null)]),
    );
    const sumsTotal = Object.fromEntries(METRIC_DEFS.map((metric) => [metric.id, 0]));

    for (const row of txResult.recordset) {
      const metricId = classifyMetric(row.DF_LEAVE, row.DF_CODE);
      if (!metricId) continue;

      const amount = metricAmount(metricId, row);
      if (!Number.isFinite(amount) || amount === 0) continue;

      const bu = String(row.bu || "").trim();
      // ตัด BU ที่ถูก exclude + รายการที่ map ไม่ติดออกจากทุกการคำนวณ (รวม Total)
      if (!bu || !(bu in headcountByBu) || EXCLUDED_BUS.has(bu)) continue;

      sumsTotal[metricId] += amount;
      sumsByMetricBu[metricId][bu] = (sumsByMetricBu[metricId][bu] || 0) + amount;
    }

    const rows = METRIC_DEFS.map((metric) => {
      const values = {};
      let maxBu = null;
      let maxValue = -Infinity;

      for (const bu of buses) {
        const raw = sumsByMetricBu[metric.id][bu.code] || 0;
        const perPerson = bu.headcount > 0 ? raw / bu.headcount : 0;
        values[bu.code] = perPerson;
        if (perPerson > maxValue) {
          maxValue = perPerson;
          maxBu = bu.code;
        }
      }

      const total =
        totalHeadcount > 0 ? (sumsTotal[metric.id] || 0) / totalHeadcount : 0;

      return {
        id: metric.id,
        label: metric.label,
        unit: metric.unit,
        values,
        total,
        maxBu: maxValue > 0 ? maxBu : null,
        maxValue: maxValue > 0 ? maxValue : 0,
      };
    });

    res.json({
      buses,
      totalHeadcount,
      rows,
      meta: {
        year,
        month,
        from,
        to,
        source: {
          master: "tbl_hr_org",
          structure: "ZHR_BU",
          transactions: "vw_employee_checkin",
        },
        excludedBus: [...EXCLUDED_BUS],
        transactionCount: txResult.recordset.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
