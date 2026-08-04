(function () {
  const AUTH_KEY = "hr_dashboard_prs_c";

  function getPrsNo() {
    const fromUrl = (new URLSearchParams(window.location.search).get("c") || "").trim();
    if (fromUrl) {
      try {
        sessionStorage.setItem(AUTH_KEY, fromUrl);
      } catch (_) {}
      return fromUrl;
    }
    try {
      return (sessionStorage.getItem(AUTH_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function withC(url) {
    const c = getPrsNo();
    if (!c) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}c=${encodeURIComponent(c)}`;
  }

  const els = {
    form: document.getElementById("acl-form"),
    prsInput: document.getElementById("prs-input"),
    prsList: document.getElementById("prs-list"),
    reportSelect: document.getElementById("report-select"),
    formStatus: document.getElementById("form-status"),
    filterPrs: document.getElementById("filter-prs"),
    list: document.getElementById("acl-list"),
    listSummary: document.getElementById("list-summary"),
    statRows: document.getElementById("stat-rows"),
    statPeople: document.getElementById("stat-people"),
    brand: document.getElementById("site-nav-brand"),
    backHome: document.getElementById("back-home"),
  };

  let rows = [];

  function setStatus(message, ok) {
    if (!els.formStatus) return;
    els.formStatus.hidden = !message;
    els.formStatus.textContent = message || "";
    els.formStatus.className = `maintain-status ${ok ? "is-ok" : "is-err"}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function detailMessage(payload) {
    if (!payload) return "เกิดข้อผิดพลาด";
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail) && payload.detail[0]?.msg) {
      return payload.detail.map((item) => item.msg).join(", ");
    }
    return payload.error || "เกิดข้อผิดพลาด";
  }

  function codeClass(reportCode) {
    if (reportCode === "ALL") return "is-all";
    if (reportCode === "emc-report") return "is-admin";
    return "";
  }

  function updateStats(sourceRows) {
    const people = new Set(sourceRows.map((row) => row.prs_no));
    if (els.statRows) els.statRows.textContent = String(sourceRows.length);
    if (els.statPeople) els.statPeople.textContent = String(people.size);
    if (els.listSummary) {
      els.listSummary.textContent = sourceRows.length
        ? `${sourceRows.length} รายการ · ${people.size} พนักงาน`
        : "ยังไม่มีสิทธิ์ที่กำหนดแบบเจาะจง";
    }
  }

  function groupByPrs(list) {
    const map = new Map();
    list.forEach((row) => {
      const key = row.prs_no || "-";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return [...map.entries()];
  }

  function bindDeleteButtons(root) {
    root.querySelectorAll("[data-del-prs]").forEach((button) => {
      button.addEventListener("click", async () => {
        const prs = button.dataset.delPrs;
        const report = button.dataset.delReport;
        if (!window.confirm(`ลบสิทธิ์ ${report} ของ ${prs}?`)) return;
        try {
          const res = await fetch(
            withC(
              `/api/admin/report-acl?prs_no=${encodeURIComponent(prs)}&report_code=${encodeURIComponent(report)}`,
            ),
            { method: "DELETE" },
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(detailMessage(payload));
          setStatus("ลบสำเร็จ", true);
          await loadAcl();
        } catch (error) {
          setStatus(error.message || "ลบไม่สำเร็จ", false);
        }
      });
    });
  }

  function renderRows() {
    const filter = (els.filterPrs?.value || "").trim().toLowerCase();
    const filtered = filter
      ? rows.filter((row) => String(row.prs_no || "").toLowerCase().includes(filter))
      : rows;

    updateStats(filtered);

    if (!els.list) return;

    if (!filtered.length) {
      els.list.innerHTML = `<div class="maintain-empty">${
        filter
          ? "ไม่พบรายการตามคำค้นหา"
          : "ยังไม่มีสิทธิ์รายงานที่กำหนด — ทุกคนยังเห็นทุกรายงานตามค่าเริ่มต้น"
      }</div>`;
      return;
    }

    const groups = groupByPrs(filtered);
    els.list.innerHTML = groups
      .map(([prs, items]) => {
        const itemRows = items
          .map(
            (row) => `
            <div class="maintain-row">
              <code class="${codeClass(row.report_code)}">${escapeHtml(row.report_code)}</code>
              <span class="maintain-row-label">${escapeHtml(row.report_label || row.report_code)}</span>
              <button
                type="button"
                class="btn-danger"
                data-del-prs="${escapeHtml(row.prs_no)}"
                data-del-report="${escapeHtml(row.report_code)}"
              >ลบ</button>
            </div>`,
          )
          .join("");
        return `
          <article class="maintain-person">
            <div class="maintain-person-head">
              <strong>${escapeHtml(prs)}</strong>
              <span>${items.length} สิทธิ์</span>
            </div>
            <div class="maintain-person-rows">${itemRows}</div>
          </article>`;
      })
      .join("");

    bindDeleteButtons(els.list);
  }

  async function loadOptions() {
    const res = await fetch(withC("/api/admin/report-acl/meta"));
    const payload = await res.json();
    if (!res.ok) throw new Error(detailMessage(payload));

    els.reportSelect.innerHTML = (payload.reports || [])
      .map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`)
      .join("");

    els.prsList.innerHTML = (payload.users || [])
      .map((user) => `<option value="${escapeHtml(user.prs_no)}"></option>`)
      .join("");
  }

  async function loadAcl() {
    const res = await fetch(withC("/api/admin/report-acl"));
    const payload = await res.json();
    if (!res.ok) throw new Error(detailMessage(payload));
    rows = payload.rows || [];
    renderRows();
  }

  async function init() {
    const c = getPrsNo();
    if (els.brand && c) {
      els.brand.setAttribute("href", `/?c=${encodeURIComponent(c)}`);
    }
    if (els.backHome) {
      els.backHome.setAttribute("href", c ? `/?c=${encodeURIComponent(c)}` : "/");
    }
    if (!c) {
      if (els.list) {
        els.list.innerHTML =
          '<div class="maintain-empty">ไม่พบสิทธิ์ — กรุณาระบุรหัสพนักงาน (?c=PRS_NO)</div>';
      }
      setStatus("ต้องระบุ ?c=PRS_NO และต้องเป็นสิทธิ์ DEPT=ALL · BR=ALL", false);
      els.form?.querySelectorAll("input,select,button").forEach((el) => {
        el.disabled = true;
      });
      return;
    }

    try {
      await loadOptions();
      await loadAcl();
    } catch (error) {
      if (els.list) {
        els.list.innerHTML = `<div class="maintain-empty">${escapeHtml(error.message)}</div>`;
      }
      setStatus(error.message, false);
      els.form?.querySelectorAll("input,select,button").forEach((el) => {
        el.disabled = true;
      });
    }
  }

  els.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prs_no = (els.prsInput?.value || "").trim();
    const report_code = (els.reportSelect?.value || "").trim();
    try {
      const res = await fetch(withC("/api/admin/report-acl"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prs_no, report_code }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(detailMessage(payload));
      setStatus(`เพิ่ม ${prs_no} → ${report_code} สำเร็จ`, true);
      els.prsInput.value = "";
      await loadAcl();
    } catch (error) {
      setStatus(error.message || "เพิ่มไม่สำเร็จ", false);
    }
  });

  let filterTimer = null;
  els.filterPrs?.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      renderRows();
    }, 150);
  });

  init();
})();
