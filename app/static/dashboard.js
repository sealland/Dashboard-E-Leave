const state = {
  charts: { dept: null, type: null },
  records: [],
  notifyEnabled: false,
  lastAlertKey: "",
  alerts: null,
  panelOpen: false,
};

function loadDashboardConfig() {
  const el = document.getElementById("dashboard-config");
  if (!el) return {};
  try {
    return JSON.parse(el.textContent || "{}");
  } catch {
    return {};
  }
}

const DASHBOARD = loadDashboardConfig();

const DAYS_OVERDUE_THRESHOLDS = { warn: 3, crit: 7 };

const ALERT_TOOLTIPS = {
  total: "รวมใบที่ยังอนุมัติไม่ครบ และค้างเกินเกณฑ์ ในช่วงวันที่ที่เลือก (N1 + HR ไม่ซ้ำกัน)",
  n1: "รอหัวหน้าอนุมัติ (ยังไม่มี App_DateN1) ค้าง ≥ 3 วัน นับจากวันยื่นคำร้อง",
  n1Crit: "รอหัวหน้า ค้าง ≥ 7 วัน (ระดับวิกฤต — รวมอยู่ใน N1 แล้ว)",
  hr: "หัวหน้าอนุมัติแล้ว แต่รอ HR (ยังไม่มี App_DateHR) ค้าง ≥ 5 วัน นับจากวันหัวหน้าอนุมัติ",
  hrCrit: "รอ HR ค้าง ≥ 14 วัน (ระดับวิกฤต — รวมอยู่ใน HR แล้ว)",
  bell: "แจ้งเตือนรายการค้างอนุมัติเกินเกณฑ์ — เอาเมาส์ชี้ที่ตัวเลขเพื่อดูความหมาย",
  days: "จำนวนวันที่ค้างในขั้นตอนนั้น",
};

const LEAVE_TYPE_LABELS = {
  1: "ขออนุมัติล่วงเวลา",
  2: "ขออนุมัติลาประเภทต่างๆ",
};

function formatLeaveType(record) {
  const ref = (record.RQI_REF || "").trim().toUpperCase();
  if (ref.startsWith("T")) return "โอที (OT)";
  if (ref.startsWith("L")) return "ลา";
  const wbdt = record.RQI_WBDT ?? record.wbdt;
  if (wbdt != null && LEAVE_TYPE_LABELS[wbdt]) {
    return LEAVE_TYPE_LABELS[wbdt];
  }
  const desc = record.WBDT_THAIDESC || "";
  if (desc && desc.includes("ล่วงเวลา")) return LEAVE_TYPE_LABELS[1];
  if (desc && desc.includes("ลาประเภท")) return LEAVE_TYPE_LABELS[2];
  return desc || "-";
}

function getDocKind() {
  const sel = $("#filter-doc-kind");
  if (sel) return sel.value || DASHBOARD.doc_kind || "all";
  return DASHBOARD.doc_kind || "";
}

function requestDateLabel() {
  const kind = getDocKind();
  if (kind === "T") return "วันขอ OT";
  if (kind === "L") return "วันขอลา";
  return "วันขอลา/OT";
}

function pastDateLabel(record) {
  const ref = (record?.RQI_REF || "").trim().toUpperCase();
  if (ref.startsWith("T")) return "เลยวัน OT แล้ว";
  if (ref.startsWith("L")) return "เลยวันลาแล้ว";
  return getDocKind() === "T" ? "เลยวัน OT แล้ว" : "เลยวันลาแล้ว";
}

function deptChartLabel() {
  const kind = getDocKind();
  if (kind === "T") return "โอที (OT)";
  if (kind === "L") return "การลา";
  return "คำร้อง";
}

const $ = (sel) => document.querySelector(sel);

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DATE_RANGE_STORAGE_KEY = DASHBOARD.dateStorageKey || "hr_approve_date_range";

function saveDateRange() {
  const from = $("#filter-date-from").value;
  const to = $("#filter-date-to").value;
  if (from && to) {
    localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify({ from, to }));
  }
}

function setDefaultDateRange() {
  const stored = localStorage.getItem(DATE_RANGE_STORAGE_KEY);
  if (stored) {
    try {
      const { from, to } = JSON.parse(stored);
      if (from && to) {
        $("#filter-date-from").value = from;
        $("#filter-date-to").value = to;
        return;
      }
    } catch {
      localStorage.removeItem(DATE_RANGE_STORAGE_KEY);
    }
  }

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  $("#filter-date-from").value = toInputDate(monthStart);
  $("#filter-date-to").value = toInputDate(today);
}

function formatDaysPastLeave(days) {
  if (days === null || days === undefined || days === "") return "-";
  const n = Number(days);
  if (Number.isNaN(n) || n <= 0) return "-";
  return `${n} วัน`;
}

function daysPastCell(days, titlePrefix, warn = 1, crit = 3) {
  if (days === null || days === undefined || days === "") {
    return '<span class="days-past-empty">-</span>';
  }
  const n = Number(days);
  if (Number.isNaN(n) || n <= 0) {
    return '<span class="days-past-empty">-</span>';
  }
  const cls = daysClass(n, warn, crit);
  return `<span class="days-past ${cls}" title="${titlePrefix} ${n} วัน">${n} วัน</span>`;
}

function daysPastLeaveCell(record) {
  const { warn, crit } = DAYS_OVERDUE_THRESHOLDS;
  return daysPastCell(record.days_past_leave, pastDateLabel(record), warn, crit);
}

function daysPastHrCell(record) {
  const { warn, crit } = DAYS_OVERDUE_THRESHOLDS;
  return daysPastCell(record.days_waiting_hr, "เลยวัน (HR) นับจากหัวหน้าอนุมัติ", warn, crit);
}

function params() {
  let dateFrom = $("#filter-date-from").value;
  let dateTo = $("#filter-date-to").value;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
    $("#filter-date-from").value = dateFrom;
    $("#filter-date-to").value = dateTo;
    saveDateRange();
  }

  const q = new URLSearchParams();
  if (dateFrom) q.set("date_from", dateFrom);
  if (dateTo) q.set("date_to", dateTo);
  const dept = $("#filter-dept").value;
  const docKind = getDocKind();
  const stage = $("#filter-stage").value;
  const active = $("#filter-active").value;
  const search = $("#filter-search").value.trim();
  if (dept) q.set("dept", dept);
  // Only lock WBDT when dashboard config says so — do not use hidden filter-type
  if (DASHBOARD.wbdt != null && DASHBOARD.wbdt !== "") {
    q.set("wbdt", String(DASHBOARD.wbdt));
  }
  if (docKind) q.set("doc_kind", docKind);
  if (stage) q.set("stage", stage);
  if (active) q.set("active", active);
  if (search) q.set("search", search);
  return q;
}

function fmtDate(v) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("th-TH");
}

function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toLocaleString("th-TH", { maximumFractionDigits: digits });
}

function daysClass(days, warn = 3, crit = 7) {
  if (days === null || days === undefined) return "";
  if (days >= crit) return "days-crit";
  if (days >= warn) return "days-warn";
  return "";
}

function stageClass(stage) {
  if (stage === "ไม่อนุมัติ") return "stage stage-cancelled";
  if (stage === "รอหัวหน้า") return "stage stage-n1";
  if (stage === "รอ HR") return "stage stage-hr";
  return "stage stage-done";
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderKpis(summary) {
  const items = [
    { key: "total", label: "คำร้องทั้งหมด", cls: "total", stage: "" },
    { key: "wait_n1", label: "รอหัวหน้าอนุมัติ", cls: "pending-n1", stage: "pending_n1" },
    { key: "wait_hr", label: "รอ HR อนุมัติ", cls: "pending-hr", stage: "pending_hr" },
    { key: "complete", label: "อนุมัติครบแล้ว", cls: "complete", stage: "complete" },
    { key: "cancelled", label: "ไม่อนุมัติ", cls: "cancelled", stage: "cancelled" },
    { key: "active_incomplete", label: "สถานะใบลา: ยังไม่ครบ", cls: "pending-hr", stage: "incomplete" },
  ];

  $("#kpi-grid").innerHTML = items
    .map(
      (i) => `
      <article class="kpi ${i.cls}" data-stage="${i.stage}">
        <div class="value">${fmtNum(summary[i.key], 0)}</div>
        <div class="label">${i.label}</div>
      </article>`
    )
    .join("");

  document.querySelectorAll(".kpi[data-stage]").forEach((el) => {
    el.addEventListener("click", () => {
      const stage = el.dataset.stage;
      if (stage) {
        $("#filter-stage").value = stage;
        loadData();
      }
    });
  });
}

function renderMetrics(summary) {
  const metrics = [
    { key: "avg_submit_to_n1", label: "วันยื่น → หัวหน้าอนุมัติ" },
    { key: "avg_leave_to_n1", label: "วันลา → หัวหน้าอนุมัติ" },
    { key: "avg_n1_to_hr", label: "หัวหน้าอนุมัติ → HR อนุมัติ" },
    { key: "avg_leave_to_hr", label: "วันลา → HR อนุมัติ" },
    { key: "avg_submit_to_hr", label: "วันยื่น → HR อนุมัติ" },
  ];

  $("#metrics-grid").innerHTML = metrics
    .map(
      (m) => `
      <div class="metric-item">
        <div class="metric-value">${fmtNum(summary[m.key])} วัน</div>
        <div class="metric-label">${m.label}</div>
      </div>`
    )
    .join("");
}

const barValueLabelsPlugin = {
  id: "barValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (value == null || value === 0) return;
        ctx.save();
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "600 12px IBM Plex Sans Thai, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(Number(value).toLocaleString("th-TH"), bar.x, bar.y - 4);
        ctx.restore();
      });
    });
  },
};

function renderChart(canvasId, chartKey, labels, datasets, type = "bar", stacked = false, showBarLabels = false) {
  const ctx = $(canvasId).getContext("2d");
  if (state.charts[chartKey]) state.charts[chartKey].destroy();
  state.charts[chartKey] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    plugins: showBarLabels ? [barValueLabelsPlugin] : [],
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#8fa3bf" } } },
      scales: {
        x: { stacked, ticks: { color: "#8fa3bf" }, grid: { color: "#2f3f56" } },
        y: { stacked, ticks: { color: "#8fa3bf" }, grid: { color: "#2f3f56" }, beginAtZero: true },
      },
    },
  });
}

function deptNaturalSortKey(code) {
  if (!code) return { prefix: "", num: 0, raw: "" };
  const slash = code.indexOf("/");
  if (slash === -1) return { prefix: code, num: 0, raw: code };
  const prefix = code.slice(0, slash);
  const num = Number.parseInt(code.slice(slash + 1), 10);
  return { prefix, num: Number.isNaN(num) ? 0 : num, raw: code };
}

function compareDeptCode(a, b) {
  const left = deptNaturalSortKey(a.DEPT_CODE);
  const right = deptNaturalSortKey(b.DEPT_CODE);
  if (left.prefix !== right.prefix) return left.prefix.localeCompare(right.prefix);
  if (left.num !== right.num) return left.num - right.num;
  return left.raw.localeCompare(right.raw);
}

function renderDeptChart(rows) {
  const top = [...rows]
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 15)
    .sort(compareDeptCode);
  const labels = top.map((r) => r.DEPT_CODE || "-");
  const stacked = getDocKind() === "all" && top.some((r) => r.leave_total != null || r.ot_total != null);

  const datasets = stacked
    ? [
        {
          label: "ลา (L)",
          data: top.map((r) => r.leave_total ?? 0),
          backgroundColor: "#38bdf8",
          stack: "dept",
        },
        {
          label: "โอที (OT)",
          data: top.map((r) => r.ot_total ?? 0),
          backgroundColor: "#f59e0b",
          stack: "dept",
        },
      ]
    : [{ label: deptChartLabel(), data: top.map((r) => r.total ?? 0), backgroundColor: "#38bdf8" }];

  renderChart("#chart-dept", "dept", labels, datasets, "bar", stacked, !stacked);
}

function renderTypeChart(rows) {
  const labels = rows.map((r) => r.WBDT_THAIDESC || formatLeaveType(r));
  renderChart(
    "#chart-type",
    "type",
    labels,
    [
      { label: "รอหัวหน้า", data: rows.map((r) => r.wait_n1 ?? r.pending_n1), backgroundColor: "#a78bfa" },
      { label: "รอ HR", data: rows.map((r) => r.wait_hr ?? r.pending_hr), backgroundColor: "#38bdf8" },
    ],
    "bar",
    false,
    true
  );
}

function renderTable(records) {
  state.records = records;
  $("#record-count").textContent = records.length;
  const requestDateTh = document.querySelector("#records-table thead th:nth-child(2)");
  if (requestDateTh) requestDateTh.textContent = requestDateLabel();
  const tbody = $("#records-table tbody");
  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="loading">ไม่พบข้อมูล</td></tr>`;
    return;
  }

  tbody.innerHTML = records
    .map((r, idx) => {
      return `
      <tr data-idx="${idx}">
        <td>${r.RQI_REF}</td>
        <td>${fmtDate(r.RQI_FROM_DATE)}</td>
        <td>${fmtDate(r.RQI_DATE)}</td>
        <td class="col-type" title="${formatLeaveType(r)}">${formatLeaveType(r)}</td>
        <td class="col-employee" title="${r.Name || ""}">${r.Name || "-"}</td>
        <td>${r.DEPT_CODE || "-"}</td>
        <td><span class="${stageClass(r.approval_stage)}">${r.approval_stage}</span></td>
        <td>${r.App_DateN1 ? fmtDate(r.App_DateN1) : "-"}</td>
        <td class="col-days-past">${daysPastLeaveCell(r)}</td>
        <td class="col-approval-date">${r.App_DateHR ? fmtDate(r.App_DateHR) : "-"}</td>
        <td class="col-days-past">${daysPastHrCell(r)}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("tr[data-idx]").forEach((tr) => {
    tr.addEventListener("click", () => openDetail(Number(tr.dataset.idx)));
  });
}

function openDetail(idx) {
  const r = state.records[idx];
  if (!r) return;

  const timeline = [
    { label: "เลยวันลา (ยังอนุมัติไม่ครบ)", value: r.days_past_leave, overdue: true },
    { label: "วันยื่นคำร้อง → หัวหน้าอนุมัติ", value: r.days_submit_to_n1, waiting: r.days_waiting_n1 },
    { label: "วันทำลา → หัวหน้าอนุมัติ", value: r.days_leave_to_n1 },
    { label: "หัวหน้าอนุมัติ → HR อนุมัติ", value: r.days_n1_to_hr, waiting: r.days_waiting_hr },
    { label: "วันทำลา → HR อนุมัติ", value: r.days_leave_to_hr },
    { label: "วันยื่นคำร้อง → HR อนุมัติ", value: r.days_submit_to_hr },
  ];

  $("#modal-content").innerHTML = `
    <div class="modal-header">
      <div>
        <h2 class="modal-title">${r.RQI_REF}</h2>
        <p class="modal-subtitle">${formatLeaveType(r)}</p>
      </div>
      <span class="${stageClass(r.approval_stage)}">${r.approval_stage}</span>
    </div>

    <section class="detail-section">
      <h3 class="detail-section-title">ข้อมูลพนักงาน</h3>
      <dl class="detail-grid">
        <dt>พนักงาน</dt><dd>${r.Name || "-"}</dd>
        <dt>รหัสพนักงาน</dt><dd>${r.PRS_NO || "-"}</dd>
        <dt>แผนก</dt><dd>${r.DEPT_THAIDESC || "-"}</dd>
        <dt>รหัสแผนก</dt><dd>${r.DEPT_CODE || "-"}</dd>
      </dl>
    </section>

    <section class="detail-section">
      <h3 class="detail-section-title">วันที่และการอนุมัติ</h3>
      <dl class="detail-grid">
        <dt>วันยื่นคำร้อง</dt><dd>${fmtDate(r.RQI_DATE)}</dd>
        <dt>ช่วงลา</dt><dd>${fmtDate(r.RQI_FROM_DATE)} – ${fmtDate(r.RQI_TO_DATE)}</dd>
        <dt>เลยวันลา</dt><dd>${formatDaysPastLeave(r.days_past_leave)}</dd>
        <dt>หัวหน้าผู้อนุมัติ</dt><dd>${r.App_N1 || "<span class='text-pending'>ยังไม่อนุมัติ</span>"}</dd>
        <dt>วันที่หัวหน้าอนุมัติ</dt><dd>${r.App_DateN1 ? fmtDate(r.App_DateN1) : "<span class='text-pending'>-</span>"}</dd>
        <dt>HR อนุมัติ</dt><dd>${r.App_DateHR ? '<span class="hr-check">✓</span> ' + fmtDate(r.App_DateHR) : "<span class='text-pending'>ยังไม่อนุมัติ</span>"}</dd>
      </dl>
    </section>

    ${r.RQI_REMARK ? `<section class="detail-remark"><strong>หมายเหตุ</strong><p>${r.RQI_REMARK}</p></section>` : ""}

    <details class="timeline">
      <summary class="timeline-summary">
        <span class="timeline-summary-text">ระยะเวลาแต่ละขั้น (วัน)</span>
        <span class="timeline-chevron" aria-hidden="true"></span>
      </summary>
      <div class="timeline-body">
      ${timeline
        .map((t) => {
          if (t.overdue && (t.value === null || t.value === undefined || Number(t.value) <= 0)) {
            return "";
          }
          const isWaiting = t.waiting != null;
          const isOverdue = t.overdue && t.value != null;
          const display = isWaiting
            ? `${t.waiting} วัน (กำลังรอ)`
            : isOverdue
              ? `${t.value} วัน`
              : t.value != null
                ? `${t.value} วัน`
                : "-";
          const { warn, crit } = DAYS_OVERDUE_THRESHOLDS;
          const valueCls = isOverdue
            ? `timeline-value timeline-value--overdue ${daysClass(Number(t.value), warn, crit)}`
            : isWaiting
              ? "timeline-value timeline-value--waiting"
              : "timeline-value";
          return `<div class="timeline-row"><span class="timeline-label">${t.label}</span><strong class="${valueCls}">${display}</strong></div>`;
        })
        .join("")}
      </div>
    </details>`;

  $("#detail-modal").showModal();
}

function toggleNotifyPanel(force) {
  const panel = $("#notify-panel");
  state.panelOpen = force !== undefined ? force : !state.panelOpen;
  panel.classList.toggle("hidden", !state.panelOpen);
}

function findRecordRef(ref) {
  const idx = state.records.findIndex((r) => r.RQI_REF === ref);
  if (idx >= 0) openDetail(idx);
}

function renderAlerts(alerts) {
  state.alerts = alerts;
  const badge = $("#notify-badge");
  const body = $("#notify-panel-body");
  const totalWarn = (alerts.warn_pending_n1 || 0) + (alerts.warn_pending_hr || 0);
  const totalCrit = (alerts.crit_pending_n1 || 0) + (alerts.crit_pending_hr || 0);
  const total = totalWarn;

  if (total > 0) {
    badge.textContent = total > 99 ? "99+" : total;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  const items = (alerts.items || []).slice(0, 8);
  const chips = `
    <div class="notify-chips">
      <span class="notify-chip warn" title="${ALERT_TOOLTIPS.n1}">N1: ${alerts.warn_pending_n1 || 0}</span>
      <span class="notify-chip crit" title="${ALERT_TOOLTIPS.n1Crit}">N1 วิกฤต: ${alerts.crit_pending_n1 || 0}</span>
      <span class="notify-chip warn" title="${ALERT_TOOLTIPS.hr}">HR: ${alerts.warn_pending_hr || 0}</span>
      <span class="notify-chip crit" title="${ALERT_TOOLTIPS.hrCrit}">HR วิกฤต: ${alerts.crit_pending_hr || 0}</span>
    </div>`;

  if (!total) {
    body.innerHTML = `<div class="notify-empty">ไม่มีรายการค้างเกินเกณฑ์</div>`;
  } else {
    const list = items
      .map((i) => {
        const wait = i.days_waiting_hr ?? i.days_waiting_n1 ?? 0;
        const dayCls = i.severity === "critical" ? "crit" : "warn";
        return `
        <div class="notify-item" data-ref="${i.RQI_REF}">
          <div>
            <div class="notify-item-ref">${i.RQI_REF}</div>
            <div class="notify-item-meta">${i.approval_stage} · ${i.Name || "-"}</div>
          </div>
          <span class="notify-item-days ${dayCls}" title="${ALERT_TOOLTIPS.days}">${wait} วัน</span>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <div class="notify-summary">
        <strong title="${ALERT_TOOLTIPS.total}">ค้างเกินเกณฑ์ ${total} รายการ</strong>
        ${chips}
      </div>
      <div class="notify-list">${list}</div>
      <div class="notify-footer">
        <button type="button" id="notify-view-all">ดูรายการค้างทั้งหมด</button>
      </div>`;

    body.querySelectorAll(".notify-item").forEach((el) => {
      el.addEventListener("click", () => {
        findRecordRef(el.dataset.ref);
        toggleNotifyPanel(false);
      });
    });

    const viewAll = $("#notify-view-all");
    if (viewAll) {
      viewAll.addEventListener("click", () => {
        $("#filter-stage").value = "incomplete";
        toggleNotifyPanel(false);
        loadData();
        document.querySelector(".table-section")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }

  maybeBrowserNotify(totalCrit, totalWarn, alerts);
}

function maybeBrowserNotify(crit, warn, alerts) {
  if (!state.notifyEnabled || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const key = `${crit}-${warn}-${alerts.items?.length || 0}`;
  if (key === state.lastAlertKey) return;
  state.lastAlertKey = key;

  const body =
    crit > 0
      ? `มี ${crit} รายการวิกฤตที่ต้องติดตามด่วน`
      : `มี ${warn} รายการค้างอนุมัติเกินเกณฑ์`;

  new Notification("HR Approval Dashboard", { body, tag: "hr-approval-alert" });
}

async function loadFilters() {
  const data = await fetchJson("/api/filters");
  const deptSel = $("#filter-dept");
  data.departments.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.DEPT_CODE;
    opt.textContent = `${d.DEPT_CODE} — ${d.DEPT_THAIDESC || ""}`;
    deptSel.appendChild(opt);
  });
  const typeSel = $("#filter-type");
  data.types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.RQI_WBDT;
    opt.textContent = t.WBDT_THAIDESC || t.RQI_WBDT;
    typeSel.appendChild(opt);
  });
}

async function loadData() {
  const q = params();
  try {
    const [summaryData, records, alerts] = await Promise.all([
      fetchJson(`/api/summary?${q}`),
      fetchJson(`/api/records?${q}`),
      fetchJson(`/api/alerts?${q}`),
    ]);

    renderKpis(summaryData.summary);
    renderMetrics(summaryData.summary);
    renderDeptChart(summaryData.by_dept);
    renderTypeChart(summaryData.by_type);
    renderTable(records);
    renderAlerts(alerts);
  } catch (err) {
    console.error(err);
    $("#kpi-grid").innerHTML = `<div class="loading">โหลดข้อมูลไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ database</div>`;
  }
}

function bindEvents() {
  ["filter-date-from", "filter-date-to"].forEach((id) => {
    $(`#${id}`).addEventListener("change", () => {
      saveDateRange();
      loadData();
    });
  });

  ["filter-dept", "filter-doc-kind", "filter-type", "filter-stage", "filter-active"].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener("change", loadData);
  });

  let searchTimer;
  $("#filter-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadData, 350);
  });

  $("#btn-refresh").addEventListener("click", loadData);

  $("#btn-notify").addEventListener("click", async (e) => {
    e.stopPropagation();
    toggleNotifyPanel();

    if (!state.notifyEnabled && "Notification" in window) {
      const perm = await Notification.requestPermission();
      state.notifyEnabled = perm === "granted";
      $("#btn-notify").classList.toggle("active", state.notifyEnabled);
      if (state.notifyEnabled) maybeBrowserNotify(
        (state.alerts?.crit_pending_n1 || 0) + (state.alerts?.crit_pending_hr || 0),
        (state.alerts?.warn_pending_n1 || 0) + (state.alerts?.warn_pending_hr || 0),
        state.alerts || {}
      );
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".notify-wrap")) toggleNotifyPanel(false);
  });

  $(".modal-close").addEventListener("click", () => $("#detail-modal").close());
  $("#detail-modal").addEventListener("click", (e) => {
    if (e.target === $("#detail-modal")) $("#detail-modal").close();
  });
}

async function init() {
  bindEvents();
  if (DASHBOARD.wbdt != null) {
    $("#filter-type").value = String(DASHBOARD.wbdt);
  }
  if (DASHBOARD.doc_kind && $("#filter-doc-kind")) {
    $("#filter-doc-kind").value = DASHBOARD.doc_kind;
  }
  setDefaultDateRange();
  if ("Notification" in window && Notification.permission === "granted") {
    state.notifyEnabled = true;
    $("#btn-notify").classList.add("active");
  }
  await loadFilters();
  await loadData();
  setInterval(loadData, 5 * 60 * 1000);
}

init();
