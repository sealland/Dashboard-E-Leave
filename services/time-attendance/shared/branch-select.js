import { withBasePath } from "./base-path.js";

/** Fill a <select> with ALL + branch codes for PDF reports. */
export async function populateBranchSelect(selectEl, auth, options = {}) {
  if (!selectEl) return [];

  const preferred = options.preferred || "";
  const statusEl = options.statusEl || null;

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-err", Boolean(isError));
  }

  function fill(codes) {
    const unique = [...new Set(codes.map((code) => String(code ?? "").trim()).filter(Boolean))];
    selectEl.innerHTML = '<option value="ALL">ALL</option>';
    unique.forEach((code) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      selectEl.appendChild(option);
    });
    if (preferred && [...selectEl.options].some((opt) => opt.value === preferred)) {
      selectEl.value = preferred;
    } else {
      selectEl.value = "ALL";
    }
    return unique;
  }

  // Limited users: use auth scope immediately (no extra round-trip needed)
  if (auth && !auth.has_all_branch && Array.isArray(auth.branches) && auth.branches.length) {
    return fill(auth.branches);
  }

  const c = String(auth?.prs_no || options.prsNo || "").trim();
  if (!c) {
    fill([]);
    setStatus("ไม่พบรหัสพนักงานสำหรับโหลดสาขา", true);
    return [];
  }

  try {
    const res = await fetch(
      `${withBasePath("/api/branch-codes")}?c=${encodeURIComponent(c)}`,
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.ok === false) {
      throw new Error(payload.error || payload.detail || `โหลดสาขาไม่สำเร็จ (${res.status})`);
    }
    const codes = fill(Array.isArray(payload.data) ? payload.data : []);
    if (!codes.length && auth?.has_all_branch) {
      setStatus("ไม่พบรายการสาขาจากฐานข้อมูล", true);
    } else {
      setStatus("");
    }
    return codes;
  } catch (error) {
    fill(Array.isArray(auth?.branches) ? auth.branches : []);
    setStatus(error.message || "โหลดสาขาไม่สำเร็จ", true);
    return [];
  }
}
