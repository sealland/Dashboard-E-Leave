import { getPool, sql } from "./db.js";

export const REPORT_E_LEAVE = "e-leave";
export const REPORT_TIME_ATTENDANCE = "time-attendance";
export const REPORT_EMC = "emc-report";
export const ALL_REPORT_CODES = [
  REPORT_E_LEAVE,
  REPORT_TIME_ATTENDANCE,
  REPORT_EMC,
];

function isAll(value) {
  return String(value || "").trim().toUpperCase() === "ALL";
}

function normalizeCode(value) {
  let text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "nan" || text.toLowerCase() === "none") return "";
  if (text.endsWith(".0") && /^\d+\.0$/.test(text)) text = text.slice(0, -2);
  return text;
}

async function loadReportCodes(prsNo) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("prs_no", sql.NVarChar(50), prsNo)
      .query(`
        SELECT
          LTRIM(RTRIM(CAST(REPORT_CODE AS NVARCHAR(50)))) AS REPORT_CODE
        FROM dbo.ZHR_AUTHORIZATION_REPORT
        WHERE LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = @prs_no
           OR (
                TRY_CAST(PRS_NO AS BIGINT) IS NOT NULL
                AND TRY_CAST(@prs_no AS BIGINT) IS NOT NULL
                AND TRY_CAST(PRS_NO AS BIGINT) = TRY_CAST(@prs_no AS BIGINT)
           )
      `);

    if (!result.recordset.length) {
      return { hasAllReports: true, reports: [...ALL_REPORT_CODES] };
    }

    const reports = [];
    const seen = new Set();
    for (const row of result.recordset) {
      const code = normalizeCode(row.REPORT_CODE);
      if (!code) continue;
      if (isAll(code)) {
        return { hasAllReports: true, reports: [...ALL_REPORT_CODES] };
      }
      if (!seen.has(code)) {
        seen.add(code);
        reports.push(code);
      }
    }
    if (!reports.length) {
      return { hasAllReports: true, reports: [...ALL_REPORT_CODES] };
    }
    return { hasAllReports: false, reports };
  } catch {
    // Table not created yet → full report access
    return { hasAllReports: true, reports: [...ALL_REPORT_CODES] };
  }
}

/**
 * Load authorization scope from dbo.ZHR_AUTHORIZATION (+ optional report ACL).
 * Empty `c` / PRS_NO → deny (ต้องระบุ ?c=).
 */
export async function getAuthorization(prsNo) {
  const code = String(prsNo || "").trim();
  if (!code) {
    return {
      prs_no: null,
      departments: [],
      branches: [],
      reports: [],
      employees: [],
      has_all_dept: false,
      has_all_branch: false,
      has_all_reports: false,
      active: false,
      allowed: false,
      message: "ไม่พบสิทธิ์ — กรุณาระบุรหัสพนักงาน (?c=PRS_NO)",
    };
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("prs_no", sql.NVarChar(50), code)
    .query(`
      SELECT
        LTRIM(RTRIM(CAST(DEPT_CODE AS NVARCHAR(100)))) AS DEPT_CODE,
        LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(100)))) AS BR_CODE
      FROM dbo.ZHR_AUTHORIZATION
      WHERE LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = @prs_no
         OR (
              TRY_CAST(PRS_NO AS BIGINT) IS NOT NULL
              AND TRY_CAST(@prs_no AS BIGINT) IS NOT NULL
              AND TRY_CAST(PRS_NO AS BIGINT) = TRY_CAST(@prs_no AS BIGINT)
         )
    `);

  const departments = [];
  const branches = [];
  const deptSeen = new Set();
  const branchSeen = new Set();
  let hasAllDept = false;
  let hasAllBranch = false;

  for (const row of result.recordset) {
    const dept = normalizeCode(row.DEPT_CODE);
    const branch = normalizeCode(row.BR_CODE);
    if (dept) {
      if (isAll(dept)) hasAllDept = true;
      else if (!deptSeen.has(dept)) {
        deptSeen.add(dept);
        departments.push(dept);
      }
    }
    if (branch) {
      if (isAll(branch)) hasAllBranch = true;
      else if (!branchSeen.has(branch)) {
        branchSeen.add(branch);
        branches.push(branch);
      }
    }
  }

  const allowed = hasAllDept || departments.length > 0;
  const { hasAllReports, reports } = allowed
    ? await loadReportCodes(code)
    : { hasAllReports: false, reports: [] };

  return {
    prs_no: code,
    departments,
    branches,
    reports: hasAllReports ? [...ALL_REPORT_CODES] : reports,
    employees: [],
    has_all_dept: hasAllDept,
    has_all_branch: hasAllBranch,
    has_all_reports: hasAllReports,
    active: true,
    allowed,
    message: allowed ? null : `ไม่พบสิทธิ์ใน ZHR_AUTHORIZATION สำหรับ ${code}`,
  };
}

export function canAccessReport(auth, reportCode) {
  if (!auth?.allowed) return false;
  const code = String(reportCode || "").trim();
  if (!code) return false;
  if (auth.has_all_reports) return true;
  return (auth.reports || []).includes(code);
}

/**
 * Append DEPT_CODE / BR_CODE restrictions to a SQL WHERE clause.
 * Mutates `request` by adding inputs. Returns SQL fragment (may be empty).
 */
export function buildAuthSql(request, auth, { alias = "", includeBranch = true } = {}) {
  if (!auth?.active) {
    return " AND 1 = 0";
  }

  const prefix = alias ? `${alias}.` : "";
  const parts = [];

  if (auth.has_all_dept) {
    // no dept restriction
  } else if (!auth.departments.length) {
    parts.push("1 = 0");
  } else {
    const keys = auth.departments.map((_, index) => {
      const name = `authDept${index}`;
      request.input(name, sql.NVarChar(200), auth.departments[index]);
      return `@${name}`;
    });
    parts.push(`${prefix}DEPT_CODE IN (${keys.join(", ")})`);
  }

  if (includeBranch) {
    if (auth.has_all_branch) {
      // no branch restriction
    } else if (auth.branches.length) {
      const keys = auth.branches.map((_, index) => {
        const name = `authBr${index}`;
        request.input(name, sql.NVarChar(50), auth.branches[index]);
        return `@${name}`;
      });
      parts.push(`${prefix}BR_CODE IN (${keys.join(", ")})`);
    }
  }

  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
}

/** Express-style gate: returns auth or sends 403 and returns null. */
export async function requireReportAuth(req, res, reportCode, { c = null } = {}) {
  const prs = c ?? req.query?.c;
  const auth = await getAuthorization(prs);
  if (!auth.allowed) {
    res.status(403).json({
      error: auth.message || "ไม่พบสิทธิ์ — กรุณาระบุรหัสพนักงาน (?c=PRS_NO)",
      auth,
    });
    return null;
  }
  if (!canAccessReport(auth, reportCode)) {
    res.status(403).json({
      error: `ไม่มีสิทธิ์เข้าใช้งานรายงานนี้ (${reportCode})`,
      auth,
    });
    return null;
  }
  return auth;
}
