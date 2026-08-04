import { populateBranchSelect } from "./shared/branch-select.js";
import { bindPdfFrameLoading } from "./shared/pdf-frame.js";
import { preserveAuthInLinks, requireAuthorization } from "./shared/prs-auth.js";
import { mountSidebarNav } from "./shared/ta-nav.js";

const REPORT_BASE = "https://reports.zubbsteel.com/hr_checkin.php";

function buildReportUrl({ period, brCode, c }) {
  const url = new URL(REPORT_BASE);
  if (c) url.searchParams.set("c", c);
  url.searchParams.set("period", period);
  if (brCode && brCode !== "ALL") url.searchParams.set("br_code", brCode);
  return url.toString();
}

function initUi(auth) {
  const c = auth?.prs_no || "";
  const periodInput = document.getElementById("period");
  const brSelect = document.getElementById("br_code");
  const brStatus = document.getElementById("br_status");
  const viewBtn = document.getElementById("viewBtn");
  const openBtn = document.getElementById("openBtn");
  const copyBtn = document.getElementById("copyBtn");
  const frame = document.getElementById("reportFrame");
  const loading = document.getElementById("loadingOverlay");
  const { setFrameSrc } = bindPdfFrameLoading(frame, loading);

  const params = new URLSearchParams(window.location.search);
  if (params.get("period")) periodInput.value = params.get("period");
  populateBranchSelect(brSelect, auth, {
    preferred: params.get("br_code") || "",
    statusEl: brStatus,
  });

  function refresh() {
    const period = periodInput.value;
    const brCode = brSelect.value;
    if (!period) {
      setFrameSrc("about:blank");
      return;
    }
    const src = buildReportUrl({ period, brCode, c });
    setFrameSrc(src);
    const u = new URL(window.location.href);
    u.searchParams.set("period", period);
    if (brCode && brCode !== "ALL") u.searchParams.set("br_code", brCode);
    else u.searchParams.delete("br_code");
    if (c) u.searchParams.set("c", c);
    history.replaceState({}, "", u.toString());
  }

  viewBtn.addEventListener("click", refresh);
  openBtn.addEventListener("click", () => {
    if (!periodInput.value) return;
    window.open(
      buildReportUrl({ period: periodInput.value, brCode: brSelect.value, c }),
      "_blank",
      "noopener,noreferrer",
    );
  });
  copyBtn.addEventListener("click", async () => {
    if (!periodInput.value) return;
    const src = buildReportUrl({
      period: periodInput.value,
      brCode: brSelect.value,
      c,
    });
    try {
      await navigator.clipboard.writeText(src);
      copyBtn.textContent = "คัดลอกแล้ว";
      setTimeout(() => {
        copyBtn.textContent = "คัดลอกลิงก์";
      }, 1200);
    } catch {
      window.prompt("คัดลอกลิงก์:", src);
    }
  });
}

mountSidebarNav("checkin");
preserveAuthInLinks();
requireAuthorization("time-attendance").then((auth) => {
  if (!auth) return;
  initUi(auth);
});
