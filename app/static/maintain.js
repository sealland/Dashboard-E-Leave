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
    return payload.error || payload.message || "เกิดข้อผิดพลาด";
  }

  function setStatus(el, message, ok) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.className = `maintain-status ${ok ? "is-ok" : "is-err"}`;
  }

  const els = {
    brand: document.getElementById("site-nav-brand"),
    backHome: document.getElementById("back-home"),
    statRows: document.getElementById("stat-rows"),
    statPeople: document.getElementById("stat-people"),
    tabs: document.querySelectorAll(".maintain-tab"),
    tabScope: document.getElementById("tab-scope"),
    tabReports: document.getElementById("tab-reports"),
    accessForm: document.getElementById("access-form"),
    accessPrs: document.getElementById("access-prs"),
    accessPrsList: document.getElementById("access-prs-list"),
    accessDept: document.getElementById("access-dept"),
    accessDeptList: document.getElementById("access-dept-list"),
    accessBr: document.getElementById("access-br"),
    accessBrList: document.getElementById("access-br-list"),
    accessReport: document.getElementById("access-report"),
    accessStatus: document.getElementById("access-status"),
    filterPrs: document.getElementById("filter-prs"),
    list: document.getElementById("acl-list"),
    listSummary: document.getElementById("list-summary"),
    scopeFilter: document.getElementById("scope-filter"),
    scopeList: document.getElementById("scope-list"),
    scopeSummary: document.getElementById("scope-summary"),
  };

  let reportRows = [];
  let scopeGroups = [];
  let activeTab = "scope";

  function updateStats(countRows, countPeople) {
    if (els.statRows) els.statRows.textContent = String(countRows);
    if (els.statPeople) els.statPeople.textContent = String(countPeople);
  }

  function switchTab(tab) {
    activeTab = tab;
    els.tabs.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    if (els.tabScope) els.tabScope.hidden = tab !== "scope";
    if (els.tabReports) els.tabReports.hidden = tab !== "reports";
    if (tab === "scope") renderScope();
    else renderReports();
  }

  function renderReports() {
    const filter = (els.filterPrs?.value || "").trim().toLowerCase();
    const filtered = filter
      ? reportRows.filter((row) => String(row.prs_no || "").toLowerCase().includes(filter))
      : reportRows;
    const people = new Set(filtered.map((r) => r.prs_no));
    updateStats(filtered.length, people.size);
    if (els.listSummary) {
      els.listSummary.textContent = filtered.length
        ? `${filtered.length} รายการ · ${people.size} พนักงาน`
        : "ยังไม่มีสิทธิ์ที่กำหนดแบบเจาะจง";
    }
    if (!els.list) return;
    if (!filtered.length) {
      els.list.innerHTML = `<div class="maintain-empty">${
        filter ? "ไม่พบรายการตามคำค้นหา" : "ยังไม่มีสิทธิ์รายงานที่กำหนด"
      }</div>`;
      return;
    }
    const map = new Map();
    filtered.forEach((row) => {
      const key = row.prs_no || "-";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    els.list.innerHTML = [...map.entries()]
      .map(([prs, items]) => {
        const rowsHtml = items
          .map(
            (row) => `
            <div class="maintain-row">
              <code class="${row.report_code === "ALL" ? "is-all" : row.report_code === "emc-report" ? "is-admin" : ""}">${escapeHtml(row.report_code)}</code>
              <span class="maintain-row-label">${escapeHtml(row.report_label || row.report_code)}</span>
              <button type="button" class="btn-danger" data-del-prs="${escapeHtml(row.prs_no)}" data-del-report="${escapeHtml(row.report_code)}">ลบ</button>
            </div>`,
          )
          .join("");
        return `<article class="maintain-person">
          <div class="maintain-person-head"><strong>${escapeHtml(prs)}</strong><span>${items.length} สิทธิ์</span></div>
          <div class="maintain-person-rows">${rowsHtml}</div>
        </article>`;
      })
      .join("");
    els.list.querySelectorAll("[data-del-prs]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm(`ลบสิทธิ์ ${button.dataset.delReport} ของ ${button.dataset.delPrs}?`)) return;
        try {
          const res = await fetch(
            withC(
              `/api/admin/report-acl?prs_no=${encodeURIComponent(button.dataset.delPrs)}&report_code=${encodeURIComponent(button.dataset.delReport)}`,
            ),
            { method: "DELETE" },
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(detailMessage(payload));
          setStatus(els.accessStatus, "ลบสิทธิ์รายงานสำเร็จ", true);
          await loadReports();
        } catch (error) {
          setStatus(els.accessStatus, error.message, false);
        }
      });
    });
  }

  async function loadReportOptions() {
    const res = await fetch(withC("/api/admin/report-acl/meta"));
    const payload = await res.json();
    if (!res.ok) throw new Error(detailMessage(payload));
    const options = (payload.reports || [])
      .map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`)
      .join("");
    if (els.accessReport) els.accessReport.innerHTML = options;
  }

  async function loadReports() {
    const res = await fetch(withC("/api/admin/report-acl"));
    const payload = await res.json();
    if (!res.ok) throw new Error(detailMessage(payload));
    reportRows = payload.rows || [];
    if (activeTab === "reports") renderReports();
  }

  function renderScope() {
    const filter = (els.scopeFilter?.value || "").trim().toLowerCase();
    const filtered = filter
      ? scopeGroups.filter(
          (g) =>
            String(g.prsNo || "").toLowerCase().includes(filter) ||
            String(g.empName || "").toLowerCase().includes(filter),
        )
      : scopeGroups;
    const rowCount = filtered.reduce((sum, g) => sum + (g.authorizations?.length || 0), 0);
    updateStats(rowCount, filtered.length);
    if (els.scopeSummary) {
      els.scopeSummary.textContent = filtered.length
        ? `${filtered.length} พนักงาน · ${rowCount} สิทธิ์`
        : "ไม่พบข้อมูล";
    }
    if (!els.scopeList) return;
    if (!filtered.length) {
      els.scopeList.innerHTML = `<div class="maintain-empty">${
        filter ? "ไม่พบรายการตามคำค้นหา" : "ยังไม่มีสิทธิ์ใน ZHR_AUTHORIZATION"
      }</div>`;
      return;
    }
    els.scopeList.innerHTML = filtered
      .map((group) => {
        const rowsHtml = (group.authorizations || [])
          .map(
            (auth) => `
            <div class="maintain-row maintain-row--scope">
              <code>${escapeHtml(auth.deptCode || "")}</code>
              <span class="maintain-row-label">${escapeHtml(auth.deptName || auth.deptCode || "")} · ${escapeHtml(auth.brName || auth.brCode || "-")}</span>
              <button type="button" class="btn-danger"
                data-scope-prs="${escapeHtml(group.prsNo)}"
                data-scope-dept="${escapeHtml(auth.deptCode || "")}"
                data-scope-br="${escapeHtml(auth.brCode == null ? "NULL" : auth.brCode)}"
              >ลบ</button>
            </div>`,
          )
          .join("");
        return `<article class="maintain-person">
          <div class="maintain-person-head">
            <strong>${escapeHtml(group.prsNo)} · ${escapeHtml(group.empName || "")}</strong>
            <span>${group.count || group.authorizations?.length || 0} สิทธิ์</span>
          </div>
          <div class="maintain-person-rows">${rowsHtml}</div>
        </article>`;
      })
      .join("");

    els.scopeList.querySelectorAll("[data-scope-prs]").forEach((button) => {
      button.addEventListener("click", async () => {
        const prs = button.dataset.scopePrs;
        const dept = button.dataset.scopeDept;
        const br = button.dataset.scopeBr;
        if (!window.confirm(`ลบสิทธิ์ ${dept} / ${br} ของ ${prs}?`)) return;
        try {
          const res = await fetch(
            withC(
              `/api/admin/zhr-auth/authorizations?prsNo=${encodeURIComponent(prs)}&deptCode=${encodeURIComponent(dept)}&brCode=${encodeURIComponent(br)}`,
            ),
            { method: "DELETE" },
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || payload.ok === false) throw new Error(detailMessage(payload));
          setStatus(els.accessStatus, "ลบขอบเขตสำเร็จ", true);
          await loadScope();
        } catch (error) {
          setStatus(els.accessStatus, error.message, false);
        }
      });
    });
  }

  async function loadAccessMeta() {
    const [empRes, deptRes, brRes] = await Promise.all([
      fetch(withC("/api/admin/zhr-auth/employees")),
      fetch(withC("/api/admin/zhr-auth/departments")),
      fetch(withC("/api/admin/zhr-auth/branches")),
    ]);
    const employees = await empRes.json();
    const departments = await deptRes.json();
    const branches = await brRes.json();
    const employeeOptions = (employees.data || employees.rows || [])
      .slice(0, 500)
      .map((e) => {
        const code = e.prsNo || e.PRS_NO || e.prs_no || "";
        return code ? `<option value="${escapeHtml(code)}"></option>` : "";
      })
      .join("");
    if (els.accessPrsList) els.accessPrsList.innerHTML = employeeOptions;

    const deptOptions =
      `<option value="ALL"></option>` +
      (departments.data || [])
        .map((d) => {
          const code = d.code || d.deptCode || d.DEPT_CODE || "";
          return code ? `<option value="${escapeHtml(code)}"></option>` : "";
        })
        .join("");
    if (els.accessDeptList) els.accessDeptList.innerHTML = deptOptions;

    const branchOptions =
      `<option value="ALL"></option>` +
      (branches.data || [])
        .map((b) => {
          const code = b.code || b.brCode || b.BR_CODE || "";
          return code ? `<option value="${escapeHtml(code)}"></option>` : "";
        })
        .join("");
    if (els.accessBrList) els.accessBrList.innerHTML = branchOptions;
  }

  async function loadScope() {
    const res = await fetch(withC("/api/admin/zhr-auth/authorizations?limit=500"));
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(detailMessage(payload));
    scopeGroups = payload.data || [];
    if (activeTab === "scope") renderScope();
  }

  async function init() {
    const c = getPrsNo();
    if (els.brand && c) els.brand.setAttribute("href", `/?c=${encodeURIComponent(c)}`);
    if (els.backHome) els.backHome.setAttribute("href", c ? `/?c=${encodeURIComponent(c)}` : "/");
    if (!c) {
      setStatus(els.accessStatus, "ต้องระบุ ?c=PRS_NO และต้องเป็นสิทธิ์ DEPT=ALL · BR=ALL", false);
      return;
    }

    els.tabs.forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    try {
      await Promise.all([loadAccessMeta(), loadScope(), loadReportOptions(), loadReports()]);
      switchTab("scope");
    } catch (error) {
      setStatus(els.accessStatus, error.message, false);
      if (els.scopeList) {
        els.scopeList.innerHTML = `<div class="maintain-empty">${escapeHtml(error.message)}</div>`;
      }
    }

    els.accessForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const prsNo = (els.accessPrs?.value || "").trim();
      const deptCode = (els.accessDept?.value || "").trim();
      const brCode = (els.accessBr?.value || "").trim() || null;
      const reportCode = (els.accessReport?.value || "").trim();
      try {
        const res = await fetch(withC("/api/admin/access"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prsNo, deptCode, brCode, reportCode }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload.ok === false) throw new Error(detailMessage(payload));
        const scopeNote = payload.scope_created ? " (สร้างขอบเขตใหม่)" : " (มีขอบเขตเดิมแล้ว)";
        setStatus(
          els.accessStatus,
          `เพิ่ม ${prsNo} · ${deptCode} · ${brCode || "-"} → ${reportCode} สำเร็จ${scopeNote}`,
          true,
        );
        els.accessPrs.value = "";
        els.accessDept.value = "";
        els.accessBr.value = "";
        await Promise.all([loadScope(), loadReports()]);
      } catch (error) {
        setStatus(els.accessStatus, error.message, false);
      }
    });

    let t1 = null;
    els.filterPrs?.addEventListener("input", () => {
      clearTimeout(t1);
      t1 = setTimeout(renderReports, 150);
    });
    let t2 = null;
    els.scopeFilter?.addEventListener("input", () => {
      clearTimeout(t2);
      t2 = setTimeout(renderScope, 150);
    });
  }

  init();
})();
