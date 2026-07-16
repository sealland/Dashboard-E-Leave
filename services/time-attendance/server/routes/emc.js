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

function mapEmcBu(row) {
  const bu = String(row.bu || row.BU || "").trim();
  const dep = String(row.dep || row.DEP || "").trim();
  const sec = String(row.sec || row.SEC || "").trim();

  if (
    bu === "OCP" ||
    dep === "OCP" ||
    sec === "OCP" ||
    sec.startsWith("OCP/")
  ) {
    return "OCP";
  }

  return bu;
}

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
        RTRIM(LTRIM(ISNULL(DEP, ''))) AS dep,
        RTRIM(LTRIM(ISNULL(SEC, ''))) AS sec,
        COUNT(*) AS headcount
      FROM dbo.tbl_hr_org
      WHERE emp_code IS NOT NULL
        AND LTRIM(RTRIM(emp_code)) <> ''
        AND BU IS NOT NULL
        AND LTRIM(RTRIM(BU)) <> ''
      GROUP BY
        RTRIM(LTRIM(BU)),
        RTRIM(LTRIM(ISNULL(DEP, ''))),
        RTRIM(LTRIM(ISNULL(SEC, '')))
    `);

    const headcountByDisplayBu = Object.create(null);
    for (const row of headcountResult.recordset) {
      const code = mapEmcBu(row);
      const headcount = Number(row.headcount) || 0;
      if (!code || headcount <= 0 || EXCLUDED_BUS.has(code)) continue;
      headcountByDisplayBu[code] = (headcountByDisplayBu[code] || 0) + headcount;
    }

    const buses = Object.entries(headcountByDisplayBu)
      .map(([code, headcount]) => ({
        code,
        headcount,
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "en"));

    const totalHeadcount = buses.reduce((sum, bu) => sum + bu.headcount, 0);
    const headcountByBu = Object.fromEntries(buses.map((bu) => [bu.code, bu.headcount]));

    const request = pool.request();
    request.input("from", sql.Date, from);
    request.input("to", sql.Date, to);

    const txResult = await request.query(`
      SELECT
        RTRIM(LTRIM(ISNULL(mapped.BU, ''))) AS bu,
        RTRIM(LTRIM(ISNULL(mapped.DEP, ''))) AS dep,
        RTRIM(LTRIM(ISNULL(mapped.SEC, ''))) AS sec,
        RTRIM(LTRIM(c.DEPT_CODE)) AS dept_code,
        RTRIM(LTRIM(c.DF_LEAVE)) AS DF_LEAVE,
        c.DF_CODE,
        CAST(c.TMR_QTY AS float) AS TMR_QTY,
        CAST(c.TMR_QTY_T AS float) AS TMR_QTY_T
      FROM dbo.vw_employee_checkin c
      OUTER APPLY (
        SELECT TOP 1
          RTRIM(LTRIM(z.BU)) AS BU,
          RTRIM(LTRIM(ISNULL(z.DEP, ''))) AS DEP,
          RTRIM(LTRIM(ISNULL(z.SEC, ''))) AS SEC
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

      const bu = mapEmcBu(row);
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

router.get("/emc/turnover", async (req, res) => {
  const baseYear = Number(req.query.year) || new Date().getFullYear();
  if (!Number.isInteger(baseYear) || baseYear < 2000 || baseYear > 2100) {
    res.status(400).json({ error: "year is invalid" });
    return;
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("year", sql.Int, baseYear);
    request.input("prevYear", sql.Int, baseYear - 1);

    const result = await request.query(`
      SELECT
        CAST(TURN_YEAR AS int) AS turn_year,
        CAST(TURN_MONTH AS int) AS turn_month,
        CAST(EMP_ALL AS float) AS emp_all,
        CAST(TURNOVER AS float) AS turnover
      FROM dbo.ZHR_TURNOVER
      WHERE TURN_YEAR IN (@year, @prevYear)
      ORDER BY TURN_YEAR ASC, TURN_MONTH ASC
    `);

    const byYearMonth = new Map();
    for (const row of result.recordset) {
      byYearMonth.set(`${row.turn_year}-${row.turn_month}`, row);
    }

    function buildSeries(year) {
      const months = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const row = byYearMonth.get(`${year}-${month}`);
        const employees = Number(row?.emp_all) || 0;
        const turnover = Number(row?.turnover) || 0;
        const rate = employees > 0 ? (turnover / employees) * 100 : null;
        return {
          month,
          employees,
          turnover,
          rate,
        };
      });
      const validRates = months.map((item) => item.rate).filter((value) => Number.isFinite(value));
      const averageRate = validRates.length
        ? validRates.reduce((sum, value) => sum + value, 0) / validRates.length
        : null;
      return {
        year,
        averageRate,
        months,
      };
    }

    res.json({
      current: buildSeries(baseYear),
      previous: buildSeries(baseYear - 1),
      meta: {
        source: "ZHR_TURNOVER",
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/emc/workforce", async (_req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        RTRIM(LTRIM(ISNULL(emp_gender, ''))) AS gender,
        BIRTH_DATE AS birth_date,
        RTRIM(LTRIM(ISNULL(BU, ''))) AS bu,
        RTRIM(LTRIM(ISNULL(DEP, ''))) AS dep,
        RTRIM(LTRIM(ISNULL(SEC, ''))) AS sec,
        RTRIM(LTRIM(ISNULL(Child, ''))) AS child,
        RTRIM(LTRIM(ISNULL(Parent, ''))) AS parent,
        RTRIM(LTRIM(ISNULL(Company, ''))) AS company
      FROM dbo.tbl_hr_org
      WHERE emp_code IS NOT NULL
        AND LTRIM(RTRIM(emp_code)) <> ''
    `);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function ageYears(birth) {
      if (!birth) return null;
      const d = birth instanceof Date ? birth : new Date(birth);
      if (Number.isNaN(d.getTime())) return null;
      let age = today.getFullYear() - d.getFullYear();
      const md = today.getMonth() - d.getMonth();
      if (md < 0 || (md === 0 && today.getDate() < d.getDate())) age -= 1;
      return age;
    }

    function generationOf(age) {
      if (age == null) return null;
      if (age >= 60 && age <= 77) return "Baby Boom";
      if (age >= 45 && age <= 59) return "X";
      if (age >= 28 && age <= 44) return "Y";
      if (age >= 15 && age <= 27) return "Z";
      return null;
    }

    /** จัดกลุ่ม BU สำหรับ treemap ตามสเปก EMC */
    function mapDisplayBu(row) {
      const bu = String(row.bu || "").trim();
      const dep = String(row.dep || "").trim();
      const sec = String(row.sec || "").trim();
      const child = String(row.child || "").trim();
      const parent = String(row.parent || "").trim();
      const company = String(row.company || "").trim();

      // HRM + MHR
      if (
        bu === "HRM" ||
        bu === "MHR" ||
        sec === "MHR" ||
        parent === "MHR" ||
        child === "MHR"
      ) {
        return "HRM";
      }

      // OCP (แยกจาก KTB — ดู DEP/SEC/Child)
      if (
        bu === "OCP" ||
        dep === "OCP" ||
        child === "OCP" ||
        sec === "OCP" ||
        sec.startsWith("OCP/")
      ) {
        return "OCP";
      }

      // MMT + 998 (และ 999 ถ้ามี)
      if (
        bu === "MMT" ||
        bu === "998" ||
        bu === "999" ||
        child === "998" ||
        child === "999" ||
        company === "998" ||
        company === "999"
      ) {
        return "MMT";
      }

      if (bu === "ITM") return "ITM";
      if (bu === "SMK") return "SMK";
      if (bu === "FNA") return "FNA";
      if (bu === "DBS") return "DBS";
      if (bu === "KTB") return "KTB";
      if (bu === "ZEN") return "ZEN";

      // อื่นๆ = ผู้บริหาร + SUVANA และ BU ที่ไม่อยู่ในรายการหลัก
      return "อื่นๆ";
    }

    let male = 0;
    let female = 0;
    const generations = {
      "Baby Boom": 0,
      X: 0,
      Y: 0,
      Z: 0,
    };
    const buCounts = Object.create(null);

    for (const row of result.recordset) {
      const gender = String(row.gender || "").trim();
      if (gender === "ชาย") male += 1;
      else if (gender === "หญิง") female += 1;

      const gen = generationOf(ageYears(row.birth_date));
      if (gen) generations[gen] += 1;

      const displayBu = mapDisplayBu(row);
      buCounts[displayBu] = (buCounts[displayBu] || 0) + 1;
    }

    const genderTotal = male + female;
    const generationList = ["Baby Boom", "X", "Y", "Z"].map((label) => ({
      label,
      count: generations[label],
    }));
    const generationTotal = generationList.reduce((s, g) => s + g.count, 0);

    const displayOrder = [
      "MMT",
      "SMK",
      "OCP",
      "KTB",
      "HRM",
      "FNA",
      "ZEN",
      "DBS",
      "ITM",
      "อื่นๆ",
    ];

    const buses = Object.entries(buCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => {
        const ia = displayOrder.indexOf(a.code);
        const ib = displayOrder.indexOf(b.code);
        const ra = ia === -1 ? 999 : ia;
        const rb = ib === -1 ? 999 : ib;
        if (ra !== rb) return ra - rb;
        return b.count - a.count || a.code.localeCompare(b.code, "en");
      });

    const buTotal = buses.reduce((s, b) => s + b.count, 0);

    res.json({
      gender: {
        male,
        female,
        total: genderTotal,
        items: [
          { key: "male", label: "Male", labelTh: "ชาย", count: male, color: "#7eb8da" },
          { key: "female", label: "Female", labelTh: "หญิง", count: female, color: "#f0a0b8" },
        ],
      },
      generation: {
        total: generationTotal,
        items: generationList,
      },
      buses: {
        total: buTotal,
        items: buses,
      },
      meta: {
        source: "tbl_hr_org",
        genderField: "emp_gender",
        asOf: today.toISOString().slice(0, 10),
        employeeRows: result.recordset.length,
        buGroups: {
          HRM: "HRM + MHR",
          MMT: "MMT + 998",
          อื่นๆ: "ผู้บริหาร + SUVANA + BU อื่น",
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
