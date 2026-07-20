import {
  aggregateDailyRows,
  buildLateSummary,
  getCategoryColor,
  LEAVE_BREAKDOWN_LABELS,
  summarize,
  summarizeByDate,
  runSelfCheck,
} from "./shared/aggregate.js";
import { fetchAttendance } from "./shared/api.js";
import {
  buildReportUrl,
  getDefaultRange,
  getExpandedFetchRange,
  getPreviousDateRange,
  passesFilters as rowPassesFilters,
} from "./shared/filters.js";
import { escapeHtml, formatDisplayDate, formatIsoDate, formatNumber, formatScanDateTime, formatShiftHours } from "./shared/format.js";
import { formatLateMinutes } from "./shared/late-calc.js";
import { getRowStatus } from "./shared/status.js";

const state = {
  rows: [],
  dailyRows: [],
  loading: false,
  error: "",
  fetchedRange: null,
  filters: {
    from: "",
    to: "",
    branch: "all",
    department: "all",
  },
  selectedDept: null,
  lastFilteredRows: [],
  lastSummary: null,
};

const els = {
  fromInput: document.getElementById("from-input"),
  toInput: document.getElementById("to-input"),
  branchSelect: document.getElementById("branch-select"),
  departmentSelect: document.getElementById("department-select"),
  statsGrid: document.getElementById("stats-grid"),
  departmentBars: document.getElementById("department-bars"),
  departmentBarsLegend: document.getElementById("dept-bars-legend"),
  leaveBreakdown: document.getElementById("leave-breakdown"),
  branchBreakdown: document.getElementById("branch-breakdown"),
  departmentTableBody: document.getElementById("department-table-body"),
  detailTableBody: document.getElementById("detail-table-body"),
  rangeLabel: document.getElementById("range-label"),
  loadingBanner: document.getElementById("loading-banner"),
  connectionStatus: document.getElementById("connection-status"),
};

const BRANCH_COLORS = [
  "#2563eb", "#0891b2", "#7c3aed", "#5fa88a", "#f59e0b",
  "#dc2626", "#64748b", "#6a7ce8", "#2eb6b0", "#c084fc", "#fb7185", "#84cc16",
];

function getBranchColor(index) {
  return BRANCH_COLORS[index % BRANCH_COLORS.length];
}

const CARD_CONFIG = [
  {
    key: "uniqueEmployees",
    label: "พนักงานทั้งหมด",
    peopleKey: "uniqueEmployees",
    unitKey: null,
    unitLabel: "คน",
    color: "var(--slate)",
    icon: "คน",
    drill: null,
  },
  {
    key: "absent",
    label: "ขาดงาน",
    peopleKey: "absentPeople",
    unitKey: "absent",
    unitLabel: "ครั้ง",
    color: "var(--color-absent)",
    icon: "ข",
    drill: null,
  },
  {
    key: "leaveTotal",
    label: "ลางาน",
    peopleKey: "leavePeople",
    unitKey: "leaveTotal",
    unitLabel: "หน่วยลา",
    color: "var(--color-leave-vacation)",
    icon: "ลา",
    drill: null,
  },
  {
    key: "lateTimes",
    label: "มาสาย",
    peopleKey: "latePeople",
    unitKey: "lateTimes",
    unitLabel: "ครั้ง",
    extraKey: "lateMinutes",
    extraLabel: "นาที",
    color: "var(--color-late)",
    icon: "ส",
    drill: "report-late.html",
  },
  {
    key: "scanIncomplete",
    label: "สแกนไม่ครบ",
    peopleKey: "scanPeople",
    unitKey: "scanIncomplete",
    unitLabel: "ครั้ง",
    color: "var(--color-leave-other)",
    icon: "มค",
    drill: null,
  },
];

function setLoading(isLoading, message = "กำลังโหลดข้อมูลจากระบบ...") {
  state.loading = isLoading;
  if (els.loadingBanner) {
    els.loadingBanner.hidden = !isLoading;
    const text = els.loadingBanner.querySelector(".loading-text");
    if (text) text.textContent = message;
  }
  document.body.classList.toggle("is-loading", isLoading);
}

function setError(message) {
  state.error = message;
  if (els.connectionStatus) {
    els.connectionStatus.textContent = message ? `⚠ ${message}` : "เชื่อมต่อระบบแล้ว";
    els.connectionStatus.classList.toggle("is-error", Boolean(message));
  }
}

function populateFilters() {
  const branchMap = new Map();
  state.dailyRows.forEach((row) => {
    if (!branchMap.has(row.branchCode)) branchMap.set(row.branchCode, row.branchName);
  });
  const branches = [...branchMap.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  const departments = [
    ...new Map(state.dailyRows.map((row) => [row.departmentCode, row.departmentName])).entries(),
  ].sort((a, b) => a[0].localeCompare(b[0], "th"));

  const savedBranch = state.filters.branch;
  const savedDept = state.filters.department;

  els.branchSelect.innerHTML = '<option value="all">สาขาทั้งหมด</option>';
  branches.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code;
    if (name && name !== code) option.title = name;
    els.branchSelect.append(option);
  });

  els.departmentSelect.innerHTML = '<option value="all">แผนกทั้งหมด</option>';
  departments.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name && name !== code ? `${code} - ${name}` : code;
    els.departmentSelect.append(option);
  });

  els.branchSelect.value = [...els.branchSelect.options].some((o) => o.value === savedBranch)
    ? savedBranch
    : "all";
  els.departmentSelect.value = [...els.departmentSelect.options].some((o) => o.value === savedDept)
    ? savedDept
    : "all";
  state.filters.branch = els.branchSelect.value;
  state.filters.department = els.departmentSelect.value;
}

function setDefaults() {
  const defaults = getDefaultRange();
  if (!state.filters.from) state.filters.from = defaults.from;
  if (!state.filters.to) state.filters.to = defaults.to;
  els.fromInput.value = state.filters.from;
  els.toInput.value = state.filters.to;
}

function passesFilters(row) {
  return rowPassesFilters(row, state.filters);
}

function getFilteredRows() {
  return state.dailyRows.filter(passesFilters);
}

function getPreviousRows() {
  const previous = getPreviousDateRange(state.filters);
  return state.dailyRows.filter((row) =>
    rowPassesFilters(row, { ...state.filters, from: previous.from, to: previous.to }),
  );
}

function getSparklinePoints(values, width = 220, height = 34) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
}

function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function cardDrillHref(card) {
  if (!card.drill) return null;
  return buildReportUrl(card.drill, state.filters);
}

function renderCards(summary, previousSummary, trends) {
  els.statsGrid.innerHTML = CARD_CONFIG.map((card) => {
    const people = summary[card.peopleKey] ?? summary[card.key] ?? 0;
    const unit = card.unitKey ? summary[card.unitKey] : null;
    const extra = card.extraKey ? summary[card.extraKey] : null;
    const previousPeople = previousSummary ? (previousSummary[card.peopleKey] ?? previousSummary[card.key] ?? 0) : 0;
    const delta = percentChange(people, previousPeople);
    const trendKey = card.unitKey || card.key;
    const trendValues = trends.map(([, day]) => day[trendKey] ?? day.uniqueEmployees?.size ?? 0);
    const points = getSparklinePoints(trendValues);
    const href = cardDrillHref(card);
    const changeMarkup =
      delta === null
        ? "ไม่มีงวดก่อนหน้า"
        : `<span class="stat-change ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${formatNumber(Math.abs(delta), 1)}%</span>`;

    const secondaryParts = [];
    if (unit !== null) secondaryParts.push(`${formatNumber(unit)} ${card.unitLabel}`);
    if (extra !== null && extra > 0) secondaryParts.push(`${formatNumber(extra, 1)} ${card.extraLabel}`);

    const tag = href ? "a" : "article";
    const attrs = href ? `href="${href}" class="stat-card stat-card--link"` : `class="stat-card"`;

    return `
      <${tag} ${attrs}>
        <div class="stat-head">
          <div class="stat-icon" style="background:${card.color}">${card.icon}</div>
          <div class="stat-title">${card.label}</div>
        </div>
        <div class="stat-value" style="color:${card.color}">
          ${formatNumber(people)}
          <span class="stat-unit">คน</span>
        </div>
        ${secondaryParts.length ? `<div class="stat-secondary">${secondaryParts.join(" · ")}</div>` : ""}
        <div class="stat-meta">
          <span>เทียบช่วงก่อนหน้า</span>
          ${changeMarkup}
        </div>
        ${href ? '<span class="stat-drill-hint">ดูรายละเอียด →</span>' : ""}
        <svg class="sparkline" viewBox="0 0 220 34" preserveAspectRatio="none" aria-hidden="true">
          <polyline fill="none" stroke="${card.color}" stroke-width="2.5" points="${points}" />
        </svg>
      </${tag}>
    `;
  }).join("");
}

function renderDepartmentBarsLegend(rows) {
  if (!els.departmentBarsLegend) return;
  const activeLeaveLabels = LEAVE_BREAKDOWN_LABELS.filter((label) =>
    rows.some((row) => row.leaveBreakdown[label] > 0),
  );
  els.departmentBarsLegend.innerHTML = `
    <span><i class="dot absent"></i>ขาดงาน</span>
    <span><i class="dot late"></i>มาสาย</span>
    ${activeLeaveLabels
      .map((label) => `<span><i class="dot" style="background:${getCategoryColor(label)}"></i>${label}</span>`)
      .join("")}
  `;
}

function buildDepartmentLeaveSegments(row, max) {
  return LEAVE_BREAKDOWN_LABELS.map((label) => {
    const value = row.leaveBreakdown[label];
    if (!value) return "";
    const width = ((value / max) * 100).toFixed(2);
    return `<div class="dept-segment leave-type" style="width:${width}%;background:${getCategoryColor(label)}"></div>`;
  }).join("");
}

function buildDepartmentLeaveDetail(row) {
  const entries = [
    { label: "ขาดงาน", value: row.absent, color: getCategoryColor("absent") },
    { label: "มาสาย", value: row.lateTimes, color: getCategoryColor("late") },
    { label: "สแกนไม่ครบ", value: row.scanIncomplete, color: "var(--color-leave-other)" },
    ...LEAVE_BREAKDOWN_LABELS.map((label) => ({
      label,
      value: row.leaveBreakdown[label],
      color: getCategoryColor(label),
    })),
  ].filter((entry) => entry.value > 0);
  if (!entries.length) return "";
  return `
    <div class="dept-leave-detail">
      ${entries
        .map(
          (entry) => `
            <span class="dept-leave-tag">
              <i style="background:${entry.color}"></i>
              ${entry.label} ${formatNumber(entry.value)}
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function deptLateHref(departmentCode) {
  return buildReportUrl("report-late.html", { ...state.filters, department: departmentCode });
}

function setSelectedDept(departmentCode) {
  const next = departmentCode || null;
  state.selectedDept = state.selectedDept === next ? null : next;
  renderDepartmentBars(state.lastSummary || { departments: [] });
  renderDepartmentTable(state.lastSummary || { departments: [] });
  renderDetailTable(state.lastFilteredRows || []);
  if (state.selectedDept) {
    els.detailTableBody?.closest(".panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function clearSelectedDept() {
  state.selectedDept = null;
  renderDepartmentBars(state.lastSummary || { departments: [] });
  renderDepartmentTable(state.lastSummary || { departments: [] });
  renderDetailTable(state.lastFilteredRows || []);
}

function renderDepartmentBars(summary) {
  const rows = [...(summary.departments || [])]
    .sort((a, b) => b.absent + b.lateTimes + b.leaveTotal - (a.absent + a.lateTimes + a.leaveTotal))
    .slice(0, 10);

  if (!rows.length) {
    els.departmentBars.innerHTML = '<div class="empty-state">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>';
    if (els.departmentBarsLegend) els.departmentBarsLegend.innerHTML = "";
    return;
  }

  renderDepartmentBarsLegend(rows);
  const max = Math.max(...rows.map((row) => row.absent + row.lateTimes + row.leaveTotal), 1);
  const clearBtn = state.selectedDept
    ? `<button type="button" class="dept-filter-clear" data-dept-clear>ล้างการเลือกแผนก</button>`
    : "";
  els.departmentBars.innerHTML = `
    ${clearBtn}
    ${rows
      .map((row) => {
        const absentWidth = ((row.absent / max) * 100).toFixed(2);
        const lateWidth = ((row.lateTimes / max) * 100).toFixed(2);
        const selected =
          state.selectedDept && state.selectedDept === row.departmentCode ? " is-selected" : "";
        return `
          <button type="button" class="dept-row is-selectable${selected}" data-dept-filter="${escapeHtml(row.departmentCode)}">
            <div class="dept-name">${escapeHtml(row.departmentCode)}</div>
            <div class="dept-main">
              <div class="dept-track">
                <div class="dept-segment absent" style="width:${absentWidth}%"></div>
                <div class="dept-segment late" style="width:${lateWidth}%"></div>
                ${buildDepartmentLeaveSegments(row, max)}
              </div>
              ${buildDepartmentLeaveDetail(row)}
            </div>
          </button>
        `;
      })
      .join("")}`;

  els.departmentBars.querySelectorAll("[data-dept-filter]").forEach((button) => {
    button.addEventListener("click", () => setSelectedDept(button.dataset.deptFilter));
  });
  const clearButton = els.departmentBars.querySelector("[data-dept-clear]");
  if (clearButton) clearButton.addEventListener("click", (event) => {
    event.stopPropagation();
    clearSelectedDept();
  });
}

function buildDonutSlices(entries, total, getColor = getCategoryColor) {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return entries
    .map(([label, value], index) => {
      const length = total ? (value / total) * circumference : 0;
      const color = getColor(label, index);
      const segment = `
        <circle cx="120" cy="120" r="${radius}" fill="none" style="stroke:${color}"
          stroke-width="28" stroke-dasharray="${length} ${circumference - length}"
          stroke-dashoffset="${-offset}" transform="rotate(-90 120 120)"></circle>`;
      offset += length;
      return segment;
    })
    .join("");
}

function renderBreakdownChart(container, entries, options = {}) {
  const { total, centerLabel, emptyMessage, getColor = (label) => getCategoryColor(label) } = options;
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }
  const donut = `
    <div class="donut-wrap">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle cx="120" cy="120" r="90" fill="none" stroke="#edf2f8" stroke-width="28"></circle>
        ${buildDonutSlices(entries, total, getColor)}
      </svg>
      <div class="donut-center"><div><strong>${formatNumber(total)}</strong><span>${centerLabel}</span></div></div>
    </div>`;
  const list = `
    <div class="leave-list">
      ${entries
        .map(([label, value], index) => {
          const pct = total ? (value / total) * 100 : 0;
          return `
            <div class="leave-item">
              <span class="leave-swatch" style="background:${getColor(label, index)}"></span>
              <span>${escapeHtml(label)}</span>
              <strong>${formatNumber(value)} (${formatNumber(pct, 1)}%)</strong>
            </div>`;
        })
        .join("")}
    </div>`;
  container.innerHTML = `${donut}${list}`;
}

function renderLeaveBreakdown(summary) {
  const entries = Object.entries(summary.leaveBreakdown).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  renderBreakdownChart(els.leaveBreakdown, entries, {
    total,
    centerLabel: "หน่วยลา",
    emptyMessage: "ไม่มีข้อมูลลาในช่วงที่เลือก",
    getColor: (label) => getCategoryColor(label),
  });
}

function renderBranchBreakdown(summary) {
  const entries = summary.branches.map((branch) => [branch.code, branch.employees]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  renderBreakdownChart(els.branchBreakdown, entries, {
    total,
    centerLabel: "พนักงาน",
    emptyMessage: "ไม่พบข้อมูลสาขาในช่วงที่เลือก",
    getColor: (_label, index) => getBranchColor(index),
  });
}

function renderDepartmentTable(summary) {
  const rows = (summary.departments || []).filter(
    (row) => row.absent + row.lateTimes + row.leaveTotal + row.scanIncomplete > 0,
  );
  if (!rows.length) {
    els.departmentTableBody.innerHTML =
      '<tr><td colspan="6">ทุกแผนกมาครบ ไม่มีรายการที่ต้องติดตาม</td></tr>';
    return;
  }
  els.departmentTableBody.innerHTML = rows
    .map((row) => {
      const lateCell =
        row.lateTimes > 0
          ? `<a class="table-link" href="${deptLateHref(row.departmentCode)}" data-dept-late-link>${formatNumber(row.lateTimes)}</a>`
          : formatNumber(row.lateTimes);
      const deptLabel = row.departmentCode || row.departmentName || "-";
      const deptTitle = row.departmentName && row.departmentName !== deptLabel ? row.departmentName : "";
      const selected =
        state.selectedDept && state.selectedDept === row.departmentCode ? " is-selected" : "";
      return `
        <tr class="dept-summary-row is-selectable${selected}" data-dept-filter="${escapeHtml(row.departmentCode)}" tabindex="0" role="button">
          <td class="col-dept" title="${escapeHtml(deptTitle || deptLabel)}">${escapeHtml(deptLabel)}</td>
          <td>${formatNumber(row.employees)}</td>
          <td>${formatNumber(row.absent)}</td>
          <td>${lateCell}</td>
          <td>${formatNumber(row.leaveTotal)}</td>
          <td>${formatNumber(row.scanIncomplete)}</td>
        </tr>`;
    })
    .join("");

  els.departmentTableBody.querySelectorAll("[data-dept-filter]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-dept-late-link]")) return;
      setSelectedDept(row.dataset.deptFilter);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setSelectedDept(row.dataset.deptFilter);
    });
  });
}

function renderDetailTable(rows) {
  const sourceRows = state.selectedDept
    ? rows.filter((row) => row.departmentCode === state.selectedDept)
    : rows;
  const tracked = [...sourceRows]
    .map((row) => ({ ...row, status: getRowStatus(row) }))
    .filter((row) => row.status.priority > 0)
    .sort((a, b) => b.status.priority - a.status.priority || a.date.localeCompare(b.date));

  const filterNote = state.selectedDept
    ? `<div class="detail-filter-note">กรองแผนก <strong>${escapeHtml(state.selectedDept)}</strong> · <button type="button" class="dept-filter-clear" data-dept-clear>ล้างตัวกรอง</button></div>`
    : "";

  if (!tracked.length) {
    els.detailTableBody.innerHTML = `
      ${filterNote ? `<tr><td colspan="7">${filterNote}</td></tr>` : ""}
      <tr><td colspan="7">${
        state.selectedDept
          ? "ไม่มีรายการที่ต้องติดตามในแผนกที่เลือก"
          : "ไม่มีรายการที่ต้องติดตาม (ซ่อนรายการปกติแล้ว)"
      }</td></tr>`;
    bindDetailFilterClear();
    return;
  }

  els.detailTableBody.innerHTML = `
    ${filterNote ? `<tr class="detail-filter-row"><td colspan="7">${filterNote}</td></tr>` : ""}
    ${tracked
      .map((row) => {
        const lateCell =
          row.lateTimes > 0
            ? `<a class="table-link" href="${buildReportUrl("report-late.html", { ...state.filters, department: row.departmentCode })}">${formatLateMinutes(row.lateMinutes)}</a>`
            : "-";
        return `
          <tr>
            <td>${escapeHtml(row.date)}</td>
            <td>${escapeHtml(row.empKey)}</td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.departmentName)}</td>
            <td>${escapeHtml(formatShiftHours(row.shift))}</td>
            <td><span class="status-pill ${row.status.className}">${row.status.label}</span></td>
            <td>${lateCell}</td>
          </tr>`;
      })
      .join("")}`;
  bindDetailFilterClear();
}

function bindDetailFilterClear() {
  els.detailTableBody.querySelectorAll("[data-dept-clear]").forEach((button) => {
    button.addEventListener("click", clearSelectedDept);
  });
}

function updateRangeLabel() {
  els.rangeLabel.textContent = `${formatDisplayDate(state.filters.from)} ถึง ${formatDisplayDate(state.filters.to)}`;
}

function refresh() {
  const filtered = getFilteredRows();
  const summary = summarize(filtered);
  const previous = summarize(getPreviousRows());
  const trends = summarizeByDate(
    state.dailyRows.filter(
      (row) =>
        !row.isHoliday &&
        (state.filters.branch === "all" || row.branchCode === state.filters.branch) &&
        (state.filters.department === "all" || row.departmentCode === state.filters.department),
    ),
  );

  if (
    state.selectedDept &&
    !(summary.departments || []).some((dept) => dept.departmentCode === state.selectedDept)
  ) {
    state.selectedDept = null;
  }

  state.lastFilteredRows = filtered;
  state.lastSummary = summary;

  renderCards(summary, previous, trends);
  renderDepartmentBars(summary);
  renderLeaveBreakdown(summary);
  renderBranchBreakdown(summary);
  renderDepartmentTable(summary);
  renderDetailTable(filtered);
  updateRangeLabel();
}

function rangeKey(range) {
  return `${range.from}__${range.to}`;
}

async function loadData() {
  const range = getExpandedFetchRange(state.filters);
  const key = rangeKey(range);
  if (state.fetchedRange === key && state.dailyRows.length) {
    refresh();
    return;
  }

  setLoading(true);
  setError("");
  try {
    const payload = await fetchAttendance({ ...state.filters, ...range });
    state.rows = payload.rows;
    state.dailyRows = aggregateDailyRows(state.rows);
    state.fetchedRange = key;
    populateFilters();
    setError("");
    if (els.connectionStatus) {
      els.connectionStatus.textContent = `เชื่อมต่อแล้ว · ${formatNumber(payload.meta?.count ?? state.rows.length)} แถว`;
      els.connectionStatus.classList.remove("is-error");
    }
    refresh();
  } catch (error) {
    setError(error.message || "ไม่สามารถโหลดข้อมูลได้");
    els.statsGrid.innerHTML = `<div class="empty-state panel-wide-msg">${escapeHtml(error.message)}</div>`;
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  const onRangeChange = () => {
    state.selectedDept = null;
    state.filters.from = els.fromInput.value;
    state.filters.to = els.toInput.value;
    if (state.filters.from && state.filters.to && state.filters.from > state.filters.to) {
      [state.filters.from, state.filters.to] = [state.filters.to, state.filters.from];
      els.fromInput.value = state.filters.from;
      els.toInput.value = state.filters.to;
    }
    loadData();
  };

  els.fromInput.addEventListener("change", onRangeChange);
  els.toInput.addEventListener("change", onRangeChange);

  els.branchSelect.addEventListener("change", (event) => {
    state.filters.branch = event.target.value;
    state.selectedDept = null;
    refresh();
  });

  els.departmentSelect.addEventListener("change", (event) => {
    state.filters.department = event.target.value;
    state.selectedDept = null;
    refresh();
  });
}

runSelfCheck();
bindEvents();
setDefaults();
loadData();
