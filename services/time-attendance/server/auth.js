import { getPool, sql } from "./db.js";

function isAll(value) {
  return String(value || "").trim().toUpperCase() === "ALL";
}

function normalizeCode(value) {
  let text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "nan" || text.toLowerCase() === "none") return "";
  if (text.endsWith(".0") && /^\d+\.0$/.test(text)) text = text.slice(0, -2);
  return text;
}

/**
 * Load authorization scope from dbo.ZHR_AUTHORIZATION.
 * Empty `c` / PRS_NO → deny (ต้องระบุ ?c=).
 */
export async function getAuthorization(prsNo) {
  const code = String(prsNo || "").trim();
  if (!code) {
    return {
      prs_no: null,
      departments: [],
      branches: [],
      employees: [],
      has_all_dept: false,
      has_all_branch: false,
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

  return {
    prs_no: code,
    departments,
    branches,
    // Reserved for EMC person-level allow-list (future)
    employees: [],
    has_all_dept: hasAllDept,
    has_all_branch: hasAllBranch,
    active: true,
    allowed,
    message: allowed ? null : `ไม่พบสิทธิ์ใน ZHR_AUTHORIZATION สำหรับ ${code}`,
  };
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
