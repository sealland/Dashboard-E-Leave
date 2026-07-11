import { getOvertimeLabel } from "./df-code-map.js";
import { numeric } from "./format.js";

export function normalizeBranchCode(value) {
  const code = String(value || "").trim();
  if (code === "998" || code === "999" || code === "MMT") return "MMT";
  return code;
}

function parseRowDate(value) {
  const text = String(value ?? "");
  if (text.includes("T")) return text.slice(0, 10);
  const parts = text.split(/[/-]/).map(Number);
  if (parts.length >= 3) {
    const [day, month, year] = parts[0] > 999 ? [parts[2], parts[1], parts[0]] : parts;
    if (day && month && year) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return text;
}

export function buildHeadcountFromAttendance(rows) {
  const branches = new Map();
  const departments = new Map();
  const allEmployees = new Set();

  rows.forEach((row) => {
    const empKey = String(row.EMP_KEY ?? row.PRS_NO ?? "");
    if (!empKey) return;

    allEmployees.add(empKey);
    const branchCode = normalizeBranchCode(row.BR_CODE);
    const deptCode = String(row.DEPT_CODE || "");

    if (!branches.has(branchCode)) {
      branches.set(branchCode, {
        code: branchCode,
        name: branchCode,
        employees: new Set(),
      });
    }
    branches.get(branchCode).employees.add(empKey);

    if (!departments.has(deptCode)) {
      departments.set(deptCode, {
        code: deptCode,
        name: deptCode,
        branchCode,
        employees: new Set(),
      });
    }
    departments.get(deptCode).employees.add(empKey);
  });

  return {
    totalEmployees: allEmployees.size,
    branches: [...branches.values()].map((branch) => ({
      code: branch.code,
      name: branch.name,
      totalEmployees: branch.employees.size,
    })),
    departments: [...departments.values()].map((department) => ({
      code: department.code,
      name: department.name,
      branchCode: department.branchCode,
      totalEmployees: department.employees.size,
    })),
  };
}

function aggregateOtByGroup(rows, groupBy) {
  const groups = new Map();

  rows.forEach((row) => {
    const hours = numeric(row.TMR_QTY_T);
    if (hours <= 0) return;

    const empKey = String(row.EMP_KEY || row.PRS_NO || "");
    const code =
      groupBy === "branch" ? normalizeBranchCode(row.BR_CODE) : String(row.DEPT_CODE || "");
    const name = code;

    if (!groups.has(code)) {
      groups.set(code, {
        code,
        name,
        totalHours: 0,
        otPeople: new Set(),
      });
    }

    const group = groups.get(code);
    group.totalHours += hours;
    group.otPeople.add(empKey);
  });

  return groups;
}

export function buildOvertimeGroupSummary(otRows, headcount, groupBy = "branch") {
  const otGroups = aggregateOtByGroup(otRows, groupBy);
  const headcountList = groupBy === "branch" ? headcount.branches : headcount.departments;
  const headcountMap = new Map(headcountList.map((item) => [item.code, item]));
  const codes = new Set([...headcountMap.keys(), ...otGroups.keys()]);

  return [...codes]
    .map((code) => {
      const head = headcountMap.get(code);
      const ot = otGroups.get(code);
      const totalEmployees = head?.totalEmployees ?? ot?.otPeople.size ?? 0;
      const otPeople = ot?.otPeople.size ?? 0;
      const totalHours = ot?.totalHours ?? 0;

      return {
        code,
        name: head?.name || ot?.name || code,
        totalEmployees,
        otPeople,
        totalHours,
        avgHoursPerEmployee: totalEmployees > 0 ? totalHours / totalEmployees : 0,
      };
    })
    .filter((group) => group.otPeople > 0)
    .sort(
      (a, b) =>
        b.avgHoursPerEmployee - a.avgHoursPerEmployee ||
        b.totalHours - a.totalHours ||
        a.name.localeCompare(b.name, "th"),
    );
}

export function buildOvertimeSummary(rows, headcount = null) {
  const employees = new Map();
  const departments = new Map();

  rows.forEach((row) => {
    const hours = numeric(row.TMR_QTY_T);
    if (hours <= 0) return;

    const empKey = String(row.EMP_KEY || row.PRS_NO || "");
    const deptCode = String(row.DEPT_CODE || "");
    const isoDate = parseRowDate(row.TMR_DATE);

    if (!employees.has(empKey)) {
      employees.set(empKey, {
        empKey,
        prsNo: String(row.PRS_NO || ""),
        name: `${row.EMP_NAME || ""} ${row.EMP_SURNME || ""}`.trim(),
        departmentCode: deptCode,
        departmentName: deptCode,
        branchCode: normalizeBranchCode(row.BR_CODE),
        branchName: normalizeBranchCode(row.BR_CODE),
        totalHours: 0,
        dayCount: 0,
        days: new Map(),
        records: [],
      });
    }

    const employee = employees.get(empKey);
    employee.totalHours += hours;
    employee.records.push(row);

    const dayKey = `${empKey}__${isoDate}`;
    if (!employee.days.has(dayKey)) {
      employee.days.set(dayKey, {
        date: row.TMR_DATE,
        isoDate,
        hours: 0,
        records: [],
      });
      employee.dayCount += 1;
    }
    const day = employee.days.get(dayKey);
    day.hours += hours;
    day.records.push(row);

    if (!departments.has(deptCode)) {
      departments.set(deptCode, {
        departmentCode: deptCode,
        departmentName: deptCode,
        people: new Set(),
        totalHours: 0,
      });
    }
    const department = departments.get(deptCode);
    department.people.add(empKey);
    department.totalHours += hours;
  });

  const employeeList = [...employees.values()]
    .map((employee) => ({
      ...employee,
      days: [...employee.days.values()].sort((a, b) => a.isoDate.localeCompare(b.isoDate)),
    }))
    .sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name, "th"));

  const departmentList = [...departments.values()]
    .map((department) => ({
      departmentCode: department.departmentCode,
      departmentName: department.departmentName,
      people: department.people.size,
      totalHours: department.totalHours,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const totalHours = employeeList.reduce((sum, employee) => sum + employee.totalHours, 0);
  const topGroup = departmentList[0] ?? null;
  const totalEmployees = headcount?.totalEmployees ?? 0;

  return {
    people: employeeList.length,
    totalEmployees,
    totalHours,
    avgHours: employeeList.length ? totalHours / employeeList.length : 0,
    avgHoursPerEmployee: totalEmployees > 0 ? totalHours / totalEmployees : 0,
    topDepartment: topGroup,
    departments: departmentList,
    employees: employeeList,
    records: rows,
    dfLabel:
      rows.length > 0
        ? getOvertimeLabel(rows[0].DF_CODE)
        : "ค่าล่วงเวลา",
  };
}
