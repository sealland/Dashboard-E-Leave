import { isLateRecord } from "./df-code-map.js";
import { enrichDailyLateReal } from "./late-calc.js";
import { formatIsoDate, includesToken, numeric, parseDateString } from "./format.js";
import { normalizeBranchCode } from "./ot-aggregate.js";

export const LEAVE_BREAKDOWN_LABELS = ["ลากิจ", "ลากิจพิเศษ", "พักร้อน", "ป่วย", "อื่นๆ"];

export const CATEGORY_COLORS = {
  absent: "var(--color-absent)",
  late: "var(--color-late)",
  ลากิจ: "var(--color-leave-business)",
  ลากิจพิเศษ: "var(--color-leave-special)",
  พักร้อน: "var(--color-leave-vacation)",
  ป่วย: "var(--color-leave-sick)",
  อื่นๆ: "var(--color-leave-other)",
};

export function getCategoryColor(key) {
  return CATEGORY_COLORS[key] ?? CATEGORY_COLORS["อื่นๆ"];
}

export function createLeaveBreakdown() {
  return Object.fromEntries(LEAVE_BREAKDOWN_LABELS.map((label) => [label, 0]));
}

function addRowLeaveBreakdown(breakdown, row) {
  breakdown["ลากิจ"] += row.leaveBusiness;
  breakdown["ลากิจพิเศษ"] += row.leaveSpecial;
  breakdown["พักร้อน"] += row.vacation;
  breakdown["ป่วย"] += row.sickNo + row.sickYes;
  breakdown["อื่นๆ"] +=
    row.maternity +
    row.sterilization +
    row.military +
    row.training +
    row.ordination +
    row.returnCountry +
    row.leaveKk;
}

function leaveTotalOf(row) {
  return (
    row.leaveBusiness +
    row.leaveSpecial +
    row.vacation +
    row.sickNo +
    row.sickYes +
    row.maternity +
    row.sterilization +
    row.military +
    row.training +
    row.ordination +
    row.returnCountry +
    row.leaveKk
  );
}

export function makeDailyBase(row) {
  const date = parseDateString(row.TMR_DATE);
  const isoDate = formatIsoDate(date);
  return {
    date: row.TMR_DATE,
    isoDate,
    monthKey: isoDate.slice(0, 7),
    empKey: String(row.EMP_KEY ?? ""),
    name: `${row.EMP_NAME || ""} ${row.EMP_SURNME || ""}`.trim(),
    departmentCode: row.DEPT_CODE || "ไม่ระบุ",
    departmentName: row.DEPT_THAIDESC || row.DEPT_CODE || "ไม่ระบุแผนก",
    department: row.DEPT_CODE || row.DEPT_THAIDESC || "ไม่ระบุ",
    branchCode: normalizeBranchCode(row.BR_CODE) || "ไม่ระบุ",
    branchName:
      normalizeBranchCode(row.BR_CODE) === "MMT"
        ? "MMT"
        : row.BR_THAIDESC || row.BR_CODE || "ไม่ระบุสาขา",
    shift: row.SF_NAME || "",
    isHoliday: includesToken(row.SF_NAME, "วันหยุด"),
    absent: 0,
    lateTimes: 0,
    lateHours: 0,
    scanIncomplete: 0,
    noScanIn: 0,
    leaveBusiness: 0,
    leaveSpecial: 0,
    vacation: 0,
    sickNo: 0,
    sickYes: 0,
    maternity: 0,
    sterilization: 0,
    military: 0,
    training: 0,
    ordination: 0,
    returnCountry: 0,
    leaveKk: 0,
    lateMinutes: 0,
    lateDetail: null,
  };
}

export function applyMapping(daily, row) {
  if (isLateRecord(row)) {
    daily.lateTimes += 1;
    return;
  }

  const leave = row.DF_LEAVE || "";
  const qty = numeric(row.TMR_QTY);

  if (includesToken(leave, "กก")) {
    daily.leaveKk += 1;
  } else if (includesToken(leave, "มข")) {
    daily.noScanIn += 1;
  } else if (includesToken(leave, "ปN")) {
    daily.sickNo += qty || 1;
  } else if (includesToken(leave, "มค")) {
    daily.scanIncomplete += 1;
  } else if (includesToken(leave, "รท")) {
    daily.military += 1;
  } else if (includesToken(leave, "กป")) {
    daily.returnCountry += 1;
  } else if (includesToken(leave, "ข")) {
    daily.absent += 1;
  } else if (includesToken(leave, "กพ")) {
    daily.leaveSpecial += 1;
  } else if (includesToken(leave, "ก")) {
    daily.leaveBusiness += 1;
  } else if (includesToken(leave, "ร")) {
    daily.vacation += 1;
  } else if (includesToken(leave, "ป")) {
    daily.sickYes += 1;
  } else if (includesToken(leave, "ค")) {
    daily.maternity += 1;
  } else if (includesToken(leave, "ม")) {
    daily.sterilization += 1;
  } else if (includesToken(leave, "ฝ")) {
    daily.training += 1;
  } else if (includesToken(leave, "อ")) {
    daily.ordination += 1;
  }
}

export function aggregateDailyRows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = `${row.EMP_KEY}__${row.TMR_DATE}`;
    if (!grouped.has(key)) grouped.set(key, makeDailyBase(row));
    applyMapping(grouped.get(key), row);
  });

  const dailyRows = [...grouped.values()].sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  enrichDailyLateReal(dailyRows, rows);
  return dailyRows;
}

export function summarize(rows) {
  const summary = {
    uniqueEmployees: new Set(),
    absentPeople: new Set(),
    latePeople: new Set(),
    leavePeople: new Set(),
    scanPeople: new Set(),
    absent: 0,
    lateTimes: 0,
    lateHours: 0,
    lateMinutes: 0,
    leaveTotal: 0,
    scanIncomplete: 0,
    departments: new Map(),
    branches: new Map(),
    leaveBreakdown: createLeaveBreakdown(),
  };

  rows.forEach((row) => {
    summary.uniqueEmployees.add(row.empKey);
    summary.absent += row.absent;
    summary.lateTimes += row.lateTimes;
    summary.lateHours += row.lateHours;
    summary.lateMinutes += row.lateMinutes || 0;
    summary.scanIncomplete += row.scanIncomplete;

    if (row.absent > 0) summary.absentPeople.add(row.empKey);
    if (row.lateTimes > 0) summary.latePeople.add(row.empKey);
    if (row.scanIncomplete > 0 || row.noScanIn > 0) summary.scanPeople.add(row.empKey);

    const leaveTotal = leaveTotalOf(row);
    if (leaveTotal > 0) summary.leavePeople.add(row.empKey);

    summary.leaveTotal += leaveTotal;
    addRowLeaveBreakdown(summary.leaveBreakdown, row);

    if (!summary.departments.has(row.departmentCode)) {
      summary.departments.set(row.departmentCode, {
        department: row.departmentCode,
        departmentCode: row.departmentCode,
        departmentName: row.departmentName,
        employees: new Set(),
        absent: 0,
        lateTimes: 0,
        lateHours: 0,
        leaveTotal: 0,
        leaveBreakdown: createLeaveBreakdown(),
        scanIncomplete: 0,
      });
    }

    const dept = summary.departments.get(row.departmentCode);
    dept.employees.add(row.empKey);
    dept.absent += row.absent;
    dept.lateTimes += row.lateTimes;
    dept.lateHours += row.lateHours;
    dept.leaveTotal += leaveTotal;
    addRowLeaveBreakdown(dept.leaveBreakdown, row);
    dept.scanIncomplete += row.scanIncomplete;

    if (!summary.branches.has(row.branchCode)) {
      summary.branches.set(row.branchCode, {
        code: row.branchCode,
        name: row.branchCode === "MMT" ? "MMT" : row.branchName,
        employees: new Set(),
      });
    }
    summary.branches.get(row.branchCode).employees.add(row.empKey);
  });

  return {
    uniqueEmployees: summary.uniqueEmployees.size,
    absentPeople: summary.absentPeople.size,
    latePeople: summary.latePeople.size,
    leavePeople: summary.leavePeople.size,
    scanPeople: summary.scanPeople.size,
    absent: summary.absent,
    lateTimes: summary.lateTimes,
    lateHours: summary.lateHours,
    lateMinutes: summary.lateMinutes,
    leaveTotal: summary.leaveTotal,
    scanIncomplete: summary.scanIncomplete,
    leaveBreakdown: summary.leaveBreakdown,
    branches: [...summary.branches.values()]
      .map((branch) => ({ ...branch, employees: branch.employees.size }))
      .sort((a, b) => b.employees - a.employees),
    departments: [...summary.departments.values()]
      .map((dept) => ({ ...dept, employees: dept.employees.size }))
      .sort((a, b) => b.absent + b.lateTimes - (a.absent + a.lateTimes)),
  };
}

export function summarizeByDate(rows) {
  const map = new Map();

  rows.forEach((row) => {
    if (!map.has(row.isoDate)) {
      map.set(row.isoDate, {
        uniqueEmployees: new Set(),
        absent: 0,
        lateTimes: 0,
        leaveTotal: 0,
        scanIncomplete: 0,
      });
    }
    const day = map.get(row.isoDate);
    day.uniqueEmployees.add(row.empKey);
    day.absent += row.absent;
    day.lateTimes += row.lateTimes;
    day.leaveTotal += leaveTotalOf(row);
    day.scanIncomplete += row.scanIncomplete;
  });

  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function buildLateSummary(dailyRows, rawRows) {
  const eligible = dailyRows.filter((row) => row.lateTimes > 0 && row.absent === 0);
  const people = new Set(eligible.map((row) => row.empKey));
  const times = eligible.reduce((sum, row) => sum + row.lateTimes, 0);
  const minutes = eligible.reduce((sum, row) => sum + (row.lateMinutes || 0), 0);
  const hours = minutes / 60;

  const records = rawRows.filter((row) => isLateRecord(row));

  return { people: people.size, times, minutes, hours, eligible, records };
}

export function runSelfCheck() {
  const rows = [
    {
      EMP_KEY: "12534",
      TMR_DATE: "8/2/2026",
      EMP_NAME: "อำนาจ",
      EMP_SURNME: "ใจชื้น",
      DEPT_THAIDESC: "D1",
      BR_CODE: "B1",
      BR_THAIDESC: "Branch 1",
      SF_CODE: "DC",
      SF_NAME: "วันทำงาน-08.00-17.00",
      TMT_STAMPINFO: "07:45 12:02 13:26 21:01",
      DF_CODE: "2121",
      DF_LEAVE: "ส",
      TMR_QTY: "0.5",
    },
    {
      EMP_KEY: "2",
      TMR_DATE: "19/6/2026",
      EMP_NAME: "B",
      EMP_SURNME: "",
      DEPT_THAIDESC: "D1",
      BR_CODE: "B1",
      BR_THAIDESC: "Branch 1",
      SF_NAME: "วันทำงาน-08.00-17.00",
      TMT_STAMPINFO: "08:03",
      DF_CODE: "2121",
      TMR_QTY: "0.5",
    },
    {
      EMP_KEY: "3",
      TMR_DATE: "19/6/2026",
      EMP_NAME: "C",
      EMP_SURNME: "",
      DEPT_THAIDESC: "D2",
      BR_CODE: "B1",
      BR_THAIDESC: "Branch 1",
      SF_NAME: "วันทำงาน",
      DF_LEAVE: "ก",
      TMR_QTY: "1",
    },
  ];
  const daily = aggregateDailyRows(rows);
  const dc = daily.find((row) => row.empKey === "12534");
  const normal = daily.find((row) => row.empKey === "2");
  console.assert(dc?.lateMinutes === 26, `DC late should be 26, got ${dc?.lateMinutes}`);
  console.assert(normal?.lateMinutes === 3, `normal late should be 3, got ${normal?.lateMinutes}`);
}
