import { withBasePath } from "./base-path.js";

const AUTH_STORAGE_KEY = "hr_dashboard_prs_c";

function readStoredPrsNo() {
  try {
    return (sessionStorage.getItem(AUTH_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function storePrsNo(code) {
  const value = String(code || "").trim();
  if (!value) return;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

export function getPrsNo() {
  const fromUrl = (new URLSearchParams(window.location.search).get("c") || "").trim();
  if (fromUrl) {
    storePrsNo(fromUrl);
    return fromUrl;
  }
  return readStoredPrsNo();
}

/** If we have c in session but not in the address bar, put it back into the URL. */
export function ensureAuthInUrl() {
  const c = getPrsNo();
  if (!c) return c;
  const params = new URLSearchParams(window.location.search);
  if ((params.get("c") || "").trim() === c) return c;
  params.set("c", c);
  const next = `${window.location.pathname}?${params.toString()}${window.location.hash || ""}`;
  window.history.replaceState({}, "", next);
  return c;
}

export function withAuthParams(params) {
  const c = getPrsNo();
  if (c) params.set("c", c);
  return params;
}

export function preserveAuthInUrl(params) {
  return withAuthParams(params);
}

/** Keep ?c= on relative nav links within Time Attendance. */
export function preserveAuthInLinks(root = document) {
  const c = ensureAuthInUrl();
  if (!c) return;
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) {
      return;
    }
    // Absolute site root (ศูนย์ Dashboard) — still pass c for landing continuity
    try {
      const url = new URL(href, window.location.href);
      url.searchParams.set("c", c);
      const sameOrigin = url.origin === window.location.origin;
      if (!sameOrigin) return;
      const next =
        url.pathname === "/"
          ? `/?${url.searchParams.toString()}`
          : `${url.pathname}${url.search}${url.hash}`;
      anchor.setAttribute("href", next);
    } catch {
      // ignore invalid href
    }
  });
}

export async function fetchAuthorization() {
  ensureAuthInUrl();
  const params = withAuthParams(new URLSearchParams());
  const response = await fetch(`${withBasePath("/api/auth")}?${params.toString()}`);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("ไม่สามารถโหลดสิทธิ์ได้");
  }
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "ไม่สามารถโหลดสิทธิ์ได้");
  }
  return payload;
}

export function isAllScope(auth) {
  if (!auth?.allowed) return false;
  if (auth.is_all_scope === true) return true;
  return Boolean(auth.has_all_dept && auth.has_all_branch);
}

export function canAccessReport(auth, reportCode) {
  if (!reportCode) return true;
  if (!auth?.allowed) return false;
  if (auth.has_all_reports === true) return true;

  const reports = Array.isArray(auth.reports) ? auth.reports : null;
  // Legacy API (ก่อนมี report ACL) — ไม่ส่งฟิลด์มา → อนุญาตตามสิทธิ์เดิม
  if (auth.has_all_reports == null && reports == null) return true;

  if (!reports || !reports.length) {
    // has_all_reports=false และไม่มีรายการ = ไม่มีสิทธิ์รายงาน
    return auth.has_all_reports !== false;
  }

  if (reports.some((code) => String(code).trim().toUpperCase() === "ALL")) {
    return true;
  }
  return reports.includes(reportCode);
}

export function renderAuthStatus(el, auth) {
  let target = document.getElementById("auth-status");
  if (!target) {
    target = document.createElement("div");
    target.id = "auth-status";
    target.className = "auth-status-chip";
    document.body.appendChild(target);
  }

  if (!auth?.active || !auth.allowed) {
    const message =
      auth?.message ||
      (!auth?.active
        ? "ไม่พบสิทธิ์ — กรุณาระบุรหัสพนักงาน (?c=PRS_NO)"
        : `ไม่พบสิทธิ์ใน ZHR_AUTHORIZATION สำหรับ ${auth.prs_no}`);
    target.textContent = message;
    target.className = "auth-status-chip is-auth-denied";
    document.body.classList.add("auth-blocked");
    showAuthBlockedOverlay(message);
    return false;
  }

  document.body.classList.remove("auth-blocked");
  hideAuthBlockedOverlay();
  if (auth.prs_no) storePrsNo(auth.prs_no);
  const deptText = auth.has_all_dept
    ? "ทุกแผนก"
    : `${auth.departments.length} แผนก`;
  const branchText = auth.has_all_branch
    ? "ทุกสาขา"
    : auth.branches.length
      ? `${auth.branches.length} สาขา`
      : "ไม่จำกัดสาขา";
  target.textContent = `สิทธิ์ ${auth.prs_no} · ${deptText} · ${branchText}`;
  target.className = "auth-status-chip is-auth-limited";
  return true;
}

function showAuthBlockedOverlay(message) {
  let overlay = document.getElementById("auth-blocked-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "auth-blocked-overlay";
    overlay.className = "auth-blocked-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="auth-blocked-card">
      <strong>ไม่พบสิทธิ์เข้าใช้งาน</strong>
      <p>${message}</p>
      <p class="auth-blocked-hint">ต้องระบุรหัสพนักงานใน URL เช่น <code>?c=PRS_NO</code></p>
    </div>
  `;
  overlay.hidden = false;
}

function hideAuthBlockedOverlay() {
  const overlay = document.getElementById("auth-blocked-overlay");
  if (overlay) overlay.hidden = true;
}

/** Returns auth if allowed (and report if specified), otherwise null and shows blocked UI. */
export async function requireAuthorization(reportCode = null) {
  let auth;
  try {
    auth = await fetchAuthorization();
  } catch (error) {
    renderAuthStatus(null, {
      active: false,
      allowed: false,
      message: error.message || "ไม่สามารถโหลดสิทธิ์ได้",
    });
    return null;
  }

  const ok = renderAuthStatus(null, auth);
  if (!ok) return null;

  if (!canAccessReport(auth, reportCode)) {
    renderAuthStatus(null, {
      ...auth,
      allowed: false,
      message: `ไม่มีสิทธิ์เข้าใช้งานรายงานนี้ (${reportCode})`,
    });
    return null;
  }
  return auth;
}
