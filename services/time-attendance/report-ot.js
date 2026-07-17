import {
  buildHeadcountFromAttendance,
  buildOvertimeGroupSummary,
  buildOvertimeSummary,
  normalizeBranchCode,
} from "./shared/ot-aggregate.js";
import { getOvertimeLabel, OT_DF_CODES } from "./shared/df-code-map.js";
import { fetchOvertime, fetchPpProductivity } from "./shared/api.js";
import {
  getDefaultRange,
  parseUrlFilters,
} from "./shared/filters.js";
import {
  escapeHtml,
  formatDisplayDate,
  formatIsoDate,
  formatLooseDate,
  formatNumber,
  parseDateString,
} from "./shared/format.js";

const els = {
  fromInput: document.getElementById("from-input"),
  toInput: document.getElementById("to-input"),
  dfCodeSelect: document.getElementById("df-code-select"),
  branchSelect: document.getElementById("branch-select"),
  departmentSelect: document.getElementById("department-select"),
  summaryGrid: document.getElementById("summary-grid"),
  branchSummaryBody: document.getElementById("branch-summary-body"),
  deptSummaryBody: document.getElementById("dept-summary-body"),
  branchChartContent: document.getElementById("branch-chart-content"),
  branchChartTabs: document.querySelectorAll("[data-branch-tab]"),
  branchCombinedChart: document.getElementById("branch-combined-chart"),
  branchCombinedTabs: document.querySelectorAll("[data-combined-tab]"),
  departmentBars: document.getElementById("department-bars"),
  heroTopBranch: document.getElementById("hero-top-branch"),
  heroTopDept: document.getElementById("hero-top-dept"),
  reportBody: document.getElementById("report-body"),
  rangeLabel: document.getElementById("range-label"),
  loadingBanner: document.getElementById("loading-banner"),
  connectionStatus: document.getElementById("connection-status"),
  ppProductivity: document.getElementById("pp-productivity"),
};

const urlParams = new URLSearchParams(window.location.search);
const state = {
  rows: [],
  filters: {
    ...parseUrlFilters(urlParams),
    df_code: urlParams.get("df_code") || "all",
  },
  fetchedKey: null,
  branchChartTab: "monthly",
  combinedChartTab: "absolute",
  branchGroups: [],
  reportPage: 1,
  reportPageSize: 10,
  ppProductivityPayload: null,
};

function getPpCalendarRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-01-01`,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function setLoading(isLoading) {
  if (els.loadingBanner) els.loadingBanner.hidden = !isLoading;
  document.body.classList.toggle("is-loading", isLoading);
}

function setDefaults() {
  const defaults = getDefaultRange();
  if (!state.filters.from) state.filters.from = defaults.from;
  if (!state.filters.to) state.filters.to = defaults.to;
  els.fromInput.value = state.filters.from;
  els.toInput.value = state.filters.to;
  els.dfCodeSelect.value = OT_DF_CODES.includes(state.filters.df_code)
    ? state.filters.df_code
    : state.filters.df_code === "all"
      ? "all"
      : "all";
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set("from", state.filters.from);
  params.set("to", state.filters.to);
  if (state.filters.df_code && state.filters.df_code !== "all") {
    params.set("df_code", state.filters.df_code);
  }
  if (state.filters.branch !== "all") params.set("branch", state.filters.branch);
  if (state.filters.department !== "all") params.set("department", state.filters.department);
  history.replaceState(null, "", `?${params.toString()}`);
}

function rowMatchesBranchDept(row) {
  if (state.filters.branch !== "all" && normalizeBranchCode(row.BR_CODE) !== state.filters.branch) {
    return false;
  }
  if (state.filters.department !== "all" && row.DEPT_CODE !== state.filters.department) return false;
  return true;
}

function getFilteredOtRows() {
  return state.rows.filter((row) => rowMatchesBranchDept(row));
}

function getFilteredAttendanceRows() {
  return getFilteredOtRows();
}

function getHeadcount() {
  return buildHeadcountFromAttendance(getFilteredAttendanceRows());
}

function populateFilters() {
  const sourceRows = state.rows;
  const branchMap = new Map();
  const deptMap = new Map();
  sourceRows.forEach((row) => {
    const branchCode = normalizeBranchCode(row.BR_CODE);
    if (!branchMap.has(branchCode)) branchMap.set(branchCode, branchCode);
    if (!deptMap.has(row.DEPT_CODE)) deptMap.set(row.DEPT_CODE, row.DEPT_CODE);
  });

  const savedBranch = state.filters.branch;
  const savedDept = state.filters.department;

  els.branchSelect.innerHTML = '<option value="all">สาขาทั้งหมด</option>';
  [...branchMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "th"))
    .forEach(([code]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      els.branchSelect.append(option);
    });

  els.departmentSelect.innerHTML = '<option value="all">แผนกทั้งหมด</option>';
  [...deptMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "th"))
    .forEach(([code]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
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

function updateRangeLabel(branchGroups, deptGroups) {
  const dfText =
    state.filters.df_code === "all"
      ? "ทุกประเภท OT"
      : getOvertimeLabel(state.filters.df_code);
  let text = `${formatDisplayDate(state.filters.from)} ถึง ${formatDisplayDate(state.filters.to)} · ${dfText}`;
  if (branchGroups[0]) {
    text += ` · สาขาสูงสุด ${branchGroups[0].name}`;
  }
  if (deptGroups[0]) {
    text += ` · แผนกสูงสุด ${deptGroups[0].name}`;
  }
  els.rangeLabel.textContent = text;
}

function updateHero(branchGroups, deptGroups) {
  if (els.heroTopBranch) {
    els.heroTopBranch.textContent = branchGroups[0]
      ? `${branchGroups[0].name} · ${formatNumber(branchGroups[0].totalHours, 2)} ชม.`
      : "-";
  }
  if (els.heroTopDept) {
    els.heroTopDept.textContent = deptGroups[0]
      ? `${deptGroups[0].name} · ${formatNumber(deptGroups[0].avgHoursPerEmployee, 2)} ชม./คน`
      : "-";
  }
}

function renderSummary(summary) {
  const cards = [
    { label: "พนักงานทั้งหมด", value: summary.totalEmployees, unit: "คน", color: "var(--slate)" },
    { label: "คนทำ OT", value: summary.people, unit: "คน", color: "var(--n1)" },
    { label: "รวมชม. OT", value: summary.totalHours, unit: "ชม.", digits: 2, color: "var(--color-late)" },
    {
      label: "เฉลี่ยชม./คนทั้งหมด",
      value: summary.avgHoursPerEmployee,
      unit: "ชม.",
      digits: 2,
      color: "var(--orange)",
    },
  ];

  els.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <div class="stat-title">${card.label}</div>
          <div class="stat-value" style="color:${card.color}">
            ${formatNumber(card.value, card.digits ?? 0)}
            <span class="stat-unit">${card.unit}</span>
          </div>
        </article>`,
    )
    .join("");
}

function renderGroupSummaryTable(target, groups) {
  if (!groups.length) {
    target.innerHTML = '<tr><td colspan="4">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>';
    return;
  }

  target.innerHTML = groups
    .map(
      (group) => `
        <tr>
          <td>${escapeHtml(group.name)}</td>
          <td>${formatNumber(group.totalEmployees)}</td>
          <td>${formatNumber(group.totalHours, 2)}</td>
          <td><strong>${formatNumber(group.avgHoursPerEmployee, 2)}</strong></td>
        </tr>`,
    )
    .join("");
}

function renderGroupBars(groups) {
  const rows = groups.slice(0, 10);
  if (!rows.length) {
    els.departmentBars.innerHTML = '<div class="empty-state">ไม่พบข้อมูล OT ตามเงื่อนไขที่เลือก</div>';
    return;
  }

  const max = Math.max(...rows.map((row) => row.avgHoursPerEmployee), 0.01);
  els.departmentBars.innerHTML = rows
    .map((row) => {
      const width = ((row.avgHoursPerEmployee / max) * 100).toFixed(2);
      return `
        <div class="dept-row">
          <div class="dept-name">${escapeHtml(row.name)}</div>
          <div class="dept-main">
            <div class="dept-track">
              <div class="dept-segment late" style="width:${width}%"></div>
            </div>
          </div>
          <div class="dept-metrics">${formatNumber(row.avgHoursPerEmployee, 2)} ชม./คน · ${formatNumber(row.totalHours, 2)} ชม. รวม</div>
        </div>`;
    })
    .join("");
}

function sortBranchesByTotalHours(groups) {
  return [...groups].sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name, "th"));
}

function getBranchBarTier(index) {
  if (index === 0) return "danger";
  if (index === 1) return "warn";
  return "normal";
}

function renderBranchBarRows(rows, maxValue, grandTotal) {
  return rows
    .map((row, index) => {
      const width = ((row.totalHours / maxValue) * 100).toFixed(2);
      const share = grandTotal > 0 ? ((row.totalHours / grandTotal) * 100).toFixed(1) : "0.0";
      const tier = getBranchBarTier(index);
      return `
        <div class="branch-bar-row">
          <div class="branch-bar-name">${escapeHtml(row.name)}</div>
          <div class="branch-bar-track">
            <div class="branch-bar-segment ${tier}" style="width:${width}%"></div>
          </div>
          <div class="branch-bar-stats">
            ${formatNumber(row.totalHours, 2)} ชม. · ${share}%
          </div>
        </div>`;
    })
    .join("");
}

function renderBranchBarSection(title, rows, grandTotal) {
  if (!rows.length) return "";
  const maxValue = Math.max(...rows.map((row) => row.totalHours), 0.01);
  return `
    <div class="branch-chart-section">
      ${title ? `<div class="branch-chart-label">${escapeHtml(title)}</div>` : ""}
      <div class="branch-bars">${renderBranchBarRows(rows, maxValue, grandTotal)}</div>
    </div>`;
}

function renderBranchTotalRanked(groups) {
  const sorted = sortBranchesByTotalHours(groups);
  if (!sorted.length) {
    els.branchChartContent.innerHTML =
      '<div class="empty-state">ไม่พบข้อมูล OT ตามเงื่อนไขที่เลือก</div>';
    return;
  }

  const grandTotal = sorted.reduce((sum, row) => sum + row.totalHours, 0);
  const mmtRows = sorted.filter((row) => row.code === "MMT");
  const otherRows = sorted.filter((row) => row.code !== "MMT").slice(0, 8);

  els.branchChartContent.innerHTML = [
    renderBranchBarSection("MMT", mmtRows, grandTotal),
    renderBranchBarSection("สาขาอื่น (Top 8)", otherRows, grandTotal),
  ]
    .filter(Boolean)
    .join("");
}

function getTrendChange(values) {
  const meaningful = values.filter((value) => value > 0);
  if (meaningful.length < 2) {
    return { text: "คงที่", className: "flat" };
  }
  const first = meaningful[0];
  const last = meaningful[meaningful.length - 1];
  if (first === 0) {
    return { text: "↑ ใหม่", className: "up" };
  }
  const change = ((last - first) / first) * 100;
  if (Math.abs(change) < 1) {
    return { text: "→ คงที่", className: "flat" };
  }
  if (change > 0) {
    return { text: `↑ ${formatNumber(change, 0)}%`, className: "up" };
  }
  return { text: `↓ ${formatNumber(Math.abs(change), 0)}%`, className: "down" };
}

function buildAllMonthLabels(rows) {
  const months = new Set();
  rows.forEach((row) => {
    const date = parseDateString(row.TMR_DATE);
    if (!date) return;
    months.add(formatIsoDate(new Date(date.getFullYear(), date.getMonth(), 1)).slice(0, 7));
  });
  return [...months].sort();
}

function buildBranchMonthlyValues(rows, code, labels) {
  const monthMap = new Map();
  rows.forEach((row) => {
    if (normalizeBranchCode(row.BR_CODE) !== code) return;
    const date = parseDateString(row.TMR_DATE);
    if (!date) return;
    const monthKey = formatIsoDate(new Date(date.getFullYear(), date.getMonth(), 1)).slice(0, 7);
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + Number(row.TMR_QTY_T || 0));
  });
  return labels.map((label) => monthMap.get(label) || 0);
}

function getBranchTrendColor(index) {
  if (index === 0) return "#dc2626";
  if (index === 1) return "#ea580c";
  return "#2563eb";
}

function buildMiniTrendSvg({ labels, values, color, width = 560, height = 56 }) {
  const padding = { top: 14, right: 6, bottom: 8, left: 6 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...values);
  const xStep = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;
  const xOf = (index) =>
    padding.left + (labels.length > 1 ? xStep * index : innerWidth / 2);
  const yOf = (value) => padding.top + innerHeight - (value / max) * innerHeight;

  const points = values.map((value, index) => ({
    x: xOf(index),
    y: yOf(value),
    value,
    index,
  }));

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${path} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  const peakIndex = points.reduce(
    (best, point, index) => (point.value > points[best].value ? index : best),
    0,
  );
  const labelIndexes = new Set([peakIndex, points.length - 1]);
  if (points.length <= 4) {
    points.forEach((_, index) => labelIndexes.add(index));
  } else {
    points.forEach((_, index) => {
      if (index % 2 === 0) labelIndexes.add(index);
    });
  }

  const dots = points
    .map((point) => {
      const showLabel = labelIndexes.has(point.index);
      return `
        <circle
          class="line-chart-point"
          cx="${point.x}"
          cy="${point.y}"
          r="2.5"
          fill="${color}"
          data-tooltip="${escapeHtml(`${formatMonthLabel(labels[point.index])}: ${formatNumber(point.value, 2)} ชม.`)}"
        ></circle>
        ${
          showLabel
            ? `<text
          x="${point.x}"
          y="${point.y - 5}"
          text-anchor="middle"
          class="branch-trend-value-label"
        >${formatNumber(point.value, 0)}</text>`
            : ""
        }`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="branch-trend-mini" role="img" aria-hidden="true">
      <path d="${area}" fill="${color}" fill-opacity="0.08"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"></path>
      ${dots}
    </svg>`;
}

function renderBranchTrendCurves(groups) {
  const sorted = sortBranchesByTotalHours(groups).slice(0, 10);
  const sourceRows = getFilteredOtRows();
  const labels = buildAllMonthLabels(sourceRows);

  if (!sorted.length || !labels.length) {
    els.branchChartContent.innerHTML =
      '<div class="empty-state">ไม่พบข้อมูล OT ตามเงื่อนไขที่เลือก</div>';
    return;
  }

  const trendRows = sorted
    .map((group, index) => {
      const values = buildBranchMonthlyValues(sourceRows, group.code, labels);
      const color = getBranchTrendColor(index);
      const tierClass = index === 0 ? "is-alert" : index === 1 ? "is-warn" : "";
      const peakValue = Math.max(...values, 0);
      const peakIndex = values.indexOf(peakValue);
      const trend = getTrendChange(values);
      const chart = buildMiniTrendSvg({ labels, values, color });

      return `
        <article class="branch-trend-row ${tierClass}">
          <div class="branch-trend-meta">
            <strong>#${index + 1} ${escapeHtml(group.name)}</strong>
            <span>${formatNumber(group.totalEmployees)} คน · ${formatNumber(group.otPeople)} คนทำ OT</span>
          </div>
          <div class="branch-trend-chart line-chart-wrap">
            ${chart}
          </div>
          <div class="branch-trend-stats">
            <div class="branch-trend-total">${formatNumber(group.totalHours, 2)} ชม.</div>
            <div class="branch-trend-peak">สูงสุด ${formatMonthLabel(labels[peakIndex])}: ${formatNumber(peakValue, 2)} ชม.</div>
            <div class="branch-trend-change ${trend.className}">${trend.text}</div>
          </div>
        </article>`;
    })
    .join("");

  els.branchChartContent.innerHTML = `
    <div class="branch-trend-board">
      <div class="branch-trend-summary">${sorted.length} สาขา · ${labels.length} เดือน · เรียงตาม OT รวม (สูง → ต่ำ)</div>
      <div class="branch-trend-list">${trendRows}</div>
      <div class="branch-trend-axis">
        <div></div>
        <div class="branch-trend-axis-labels">
          ${labels.map((label) => `<span>${formatMonthLabel(label)}</span>`).join("")}
        </div>
        <div></div>
      </div>
      <div class="line-chart-tooltip" hidden></div>
    </div>`;
}

function renderBranchChart(groups) {
  if (!els.branchChartContent) return;
  if (state.branchChartTab === "monthly") {
    renderBranchTrendCurves(groups);
  } else {
    renderBranchTotalRanked(groups);
  }
  bindLineChartTooltip(els.branchChartContent);
  renderBranchCombinedChart(groups);
}

const COMBINED_SERIES_COLORS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#ca8a04",
  "#9333ea",
  "#0369a1",
];

function getCombinedSeriesColor(index) {
  return COMBINED_SERIES_COLORS[index % COMBINED_SERIES_COLORS.length];
}

function toIndexedValues(values) {
  const baseIndex = values.findIndex((value) => value > 0);
  if (baseIndex === -1) return values.map(() => 0);
  const base = values[baseIndex];
  return values.map((value) => (base > 0 ? (value / base) * 100 : 0));
}

function buildCombinedSeries(groups, labels, sourceRows, { indexed = false } = {}) {
  return groups.map((group, index) => {
    let values = buildBranchMonthlyValues(sourceRows, group.code, labels);
    if (indexed) values = toIndexedValues(values);
    return {
      code: group.code,
      name: group.name,
      values,
      color: getCombinedSeriesColor(index),
    };
  });
}

function formatCombinedValue(value, mode) {
  if (mode === "index") return `${formatNumber(value, 0)}`;
  return formatNumber(value, 0);
}

function buildMultiLineChartSvg({ labels, series, mode = "absolute", width = 720, height = 200 }) {
  const padding = { top: 16, right: 56, bottom: 32, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const dataMax = Math.max(...series.flatMap((item) => item.values), 1);
  const max = mode === "index" ? Math.max(100, dataMax) * 1.08 : dataMax;
  const xStep = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;
  const xOf = (index) =>
    padding.left + (labels.length > 1 ? xStep * index : innerWidth / 2);
  const yOf = (value) => padding.top + innerHeight - (value / max) * innerHeight;
  const axisSuffix = mode === "index" ? "" : "";

  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (max / 4) * index;
    const y = yOf(value);
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="line-chart-grid" />
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="line-chart-axis">${formatCombinedValue(value, mode)}${mode === "index" && index > 0 ? "" : axisSuffix}</text>`;
  }).join("");

  const monthLabels = labels
    .map(
      (label, index) => `
        <text x="${xOf(index)}" y="${height - 10}" text-anchor="middle" class="line-chart-axis">${formatMonthLabel(label)}</text>`,
    )
    .join("");

  const lines = series
    .map((item) => {
      const points = item.values.map((value, index) => ({
        x: xOf(index),
        y: yOf(value),
        value,
        index,
      }));
      const path = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
      const dots = points
        .map(
          (point) => `
            <circle
              class="line-chart-point"
              cx="${point.x}"
              cy="${point.y}"
              r="4.5"
              fill="${item.color}"
              data-tooltip="${escapeHtml(`${item.code} ${formatMonthLabel(labels[point.index])}: ${formatNumber(point.value, mode === "index" ? 0 : 2)}${mode === "index" ? " (index)" : " ชม."}`)}"
            ></circle>`,
        )
        .join("");
      const lastPoint = points[points.length - 1];
      const endLabel = lastPoint
        ? `<text x="${lastPoint.x + 8}" y="${lastPoint.y + 4}" class="line-chart-end-label">${escapeHtml(item.code)}</text>`
        : "";
      return `
        <path d="${path}" fill="none" stroke="${item.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
        ${dots}
        ${endLabel}`;
    })
    .join("");

  const ariaLabel =
    mode === "index"
      ? "กราฟเส้นเปรียบเทียบ index trend OT รวมทุกสาขา"
      : "กราฟเส้นเปรียบเทียบชั่วโมง OT รวมทุกสาขา";

  return `
    <svg viewBox="0 0 ${width} ${height}" class="line-chart-svg" role="img" aria-label="${ariaLabel}">
      ${grid}
      ${lines}
      ${monthLabels}
    </svg>`;
}

function renderCombinedLegend(series, mode) {
  return series
    .map(
      (item) => `
        <span class="line-chart-legend-item">
          <i style="background:${item.color}"></i>
          ${escapeHtml(item.code)}${mode === "index" ? ` · index ${formatNumber(item.values[item.values.length - 1] || 0, 0)}` : ` · ${formatNumber(item.values.reduce((sum, value) => sum + value, 0), 2)} ชม.`}
        </span>`,
    )
    .join("");
}

function renderCombinedChartBlock(title, subtitle, series, labels, mode, { compact = false } = {}) {
  if (!series.length || !labels.length) {
    return "";
  }

  const chart = buildMultiLineChartSvg({
    labels,
    series,
    mode,
    width: compact ? 600 : 720,
    height: compact ? 200 : 240,
  });
  const legend = renderCombinedLegend(series, mode);
  const compactClass = compact ? " branch-combined-wrap--compact" : "";

  return `
    <div class="branch-combined-section${compact ? " branch-combined-section--compact" : ""}">
      <div class="branch-chart-label">${escapeHtml(title)}</div>
      ${subtitle ? `<p class="branch-combined-note">${escapeHtml(subtitle)}</p>` : ""}
      <div class="line-chart-wrap branch-combined-wrap${compactClass}">
        ${chart}
        <div class="line-chart-legend">${legend}</div>
      </div>
    </div>`;
}

function renderBranchCombinedChart(groups) {
  if (!els.branchCombinedChart) return;

  const sorted = sortBranchesByTotalHours(groups);
  const sourceRows = getFilteredOtRows();
  const labels = buildAllMonthLabels(sourceRows);

  if (!sorted.length || !labels.length) {
    els.branchCombinedChart.innerHTML =
      '<div class="empty-state">ไม่พบข้อมูล OT ตามเงื่อนไขที่เลือก</div>';
    return;
  }

  let blocks = [];

  if (state.combinedChartTab === "index") {
    const series = buildCombinedSeries(sorted, labels, sourceRows, { indexed: true });
    blocks = [
      renderCombinedChartBlock(
        "ทุกสาขา · Index 100",
        "เทียบรูปทรง curve โดยเดือนแรกที่มี OT = 100 · อ่าน trend ขึ้น/ลงข้ามสาขาได้",
        series,
        labels,
        "index",
      ),
    ];
  } else {
    const mmtGroups = sorted.filter((group) => group.code === "MMT");
    const otherGroups = sorted.filter((group) => group.code !== "MMT");
    const mmtSeries = buildCombinedSeries(mmtGroups, labels, sourceRows);
    const otherSeries = buildCombinedSeries(otherGroups, labels, sourceRows);

    const mmtBlock = renderCombinedChartBlock(
      "MMT",
      "scale เฉพาะ MMT",
      mmtSeries,
      labels,
      "absolute",
      { compact: true },
    );
    const otherBlock = renderCombinedChartBlock(
      `สาขาอื่น (${otherGroups.length} สาขา)`,
      "ทุกสาขานอก MMT ใน scale เดียวกัน · เปรียบเทียบ curve ข้ามสาขาได้ทันที",
      otherSeries,
      labels,
      "absolute",
      { compact: true },
    );
    blocks = [
      `<div class="branch-combined-pair">${mmtBlock}${otherBlock}</div>`,
    ];
  }

  els.branchCombinedChart.innerHTML = `
    <div class="branch-combined-board">
      ${blocks.filter(Boolean).join("") || '<div class="empty-state">ไม่พบข้อมูล OT ตามเงื่อนไขที่เลือก</div>'}
      <div class="line-chart-tooltip" hidden></div>
    </div>`;

  bindLineChartTooltip(els.branchCombinedChart);
}

function setCombinedChartTab(tab) {
  state.combinedChartTab = tab;
  els.branchCombinedTabs.forEach((button) => {
    const active = button.dataset.combinedTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  renderBranchCombinedChart(state.branchGroups);
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

function setBranchChartTab(tab) {
  state.branchChartTab = tab;
  els.branchChartTabs.forEach((button) => {
    const active = button.dataset.branchTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  renderBranchChart(state.branchGroups);
}

function bindLineChartTooltip(container) {
  if (!container) return;
  const tooltip = container.querySelector(".line-chart-tooltip");
  if (!tooltip) return;

  const points = container.querySelectorAll(".line-chart-point");
  const showTooltip = (event) => {
    const text = event.currentTarget.dataset.tooltip;
    if (!text) return;
    tooltip.innerHTML = text;
    tooltip.hidden = false;

    const board =
      container.querySelector(".branch-trend-board") ||
      container.querySelector(".branch-combined-board") ||
      container;
    const boardRect = board.getBoundingClientRect();
    const pointRect = event.currentTarget.getBoundingClientRect();
    const left = pointRect.left - boardRect.left + pointRect.width / 2;
    const top = pointRect.top - boardRect.top - 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
  };

  points.forEach((point) => {
    point.addEventListener("mouseenter", showTooltip);
    point.addEventListener("mousemove", showTooltip);
    point.addEventListener("mouseleave", hideTooltip);
  });
}

function renderReport(summary) {
  const people = summary.employees;

  if (!people.length) {
    els.reportBody.innerHTML =
      '<div class="empty-state">ไม่พบรายการ OT ในช่วงที่เลือก</div>';
    return;
  }

  const pageSizeOptions = [10, 20, 50];
  if (!pageSizeOptions.includes(state.reportPageSize)) {
    state.reportPageSize = 10;
  }
  const totalPages = Math.max(1, Math.ceil(people.length / state.reportPageSize));
  state.reportPage = Math.min(Math.max(1, state.reportPage), totalPages);
  const start = (state.reportPage - 1) * state.reportPageSize;
  const end = start + state.reportPageSize;
  const pagePeople = people.slice(start, end);

  const cards = pagePeople
    .map((person, index) => {
      const personIndex = start + index;
      const dayRows = person.days
        .map(
          (day) => `
            <tr>
              <td>${escapeHtml(formatLooseDate(day.date))}</td>
              <td>${formatNumber(day.hours, 2)}</td>
              <td>${formatNumber(day.records.length)}</td>
            </tr>`,
        )
        .join("");

      const recordRows = person.records
        .map(
          (rec) => `
            <tr>
              <td>${escapeHtml(formatLooseDate(rec.TMR_DATE))}</td>
              <td><code>${escapeHtml(rec.DF_CODE)}</code></td>
              <td>${escapeHtml(rec.DF_DESC || "-")}</td>
              <td><strong>${formatNumber(rec.TMR_QTY_T, 2)}</strong></td>
            </tr>`,
        )
        .join("");

      return `
        <article class="report-person panel">
          <button class="report-person-head" type="button" aria-expanded="false" data-target="person-${personIndex}">
            <div class="report-person-ident">
              <strong>${escapeHtml(person.name)}</strong>
              <span class="report-meta">${escapeHtml(person.prsNo || person.empKey)}</span>
            </div>
            <div class="report-person-org">
              <span>${escapeHtml(person.departmentName)}</span>
              <span>${escapeHtml(person.branchName)}</span>
            </div>
            <div class="report-person-days">
              ${formatNumber(person.dayCount)} วัน
            </div>
            <div class="report-person-stats">
              <strong>${formatNumber(person.totalHours, 2)} ชม.</strong>
              <span class="report-toggle">ดูรายละเอียด</span>
            </div>
          </button>
          <div class="report-person-body" id="person-${personIndex}" hidden>
            <h3>สรุปรายวัน</h3>
            <div class="table-wrap compact">
              <table>
                <thead>
                  <tr><th>วันที่</th><th>ชั่วโมง OT</th><th>รายการ</th></tr>
                </thead>
                <tbody>${dayRows}</tbody>
              </table>
            </div>
            <h3>ข้อมูลต้นทาง (vw_employee_checkin)</h3>
            <div class="table-wrap">
              <table class="record-table">
                <thead>
                  <tr><th>วันที่</th><th>DF_CODE</th><th>รายละเอียด</th><th>ชั่วโมง (TMR_QTY_T)</th></tr>
                </thead>
                <tbody>${recordRows}</tbody>
              </table>
            </div>
          </div>
        </article>`;
    })
    .join("");

  els.reportBody.innerHTML = `
    <div class="report-toolbar">
      <div class="report-toolbar-meta">
        <strong>${formatNumber(people.length)} คน</strong>
        <span>แสดง ${formatNumber(start + 1)}-${formatNumber(Math.min(end, people.length))} จากทั้งหมด</span>
      </div>
      <div class="report-pagination">
        <label class="report-page-size">
          <span>หน้าละ</span>
          <select data-report-page-size>
            ${pageSizeOptions
              .map(
                (size) => `<option value="${size}" ${size === state.reportPageSize ? "selected" : ""}>${size}</option>`,
              )
              .join("")}
          </select>
          <span>คน</span>
        </label>
        <div class="report-pagination-controls">
          <button type="button" class="report-page-btn" data-report-page-action="prev" ${state.reportPage <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
          <span class="report-page-indicator">หน้า ${formatNumber(state.reportPage)} / ${formatNumber(totalPages)}</span>
          <button type="button" class="report-page-btn" data-report-page-action="next" ${state.reportPage >= totalPages ? "disabled" : ""}>ถัดไป</button>
        </div>
      </div>
    </div>
    <div class="report-cards">${cards}</div>
  `;

  els.reportBody.querySelectorAll(".report-person-head").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      target.hidden = expanded;
      button.classList.toggle("is-open", !expanded);
    });
  });

  const pageSizeSelect = els.reportBody.querySelector("[data-report-page-size]");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (event) => {
      state.reportPageSize = Number(event.target.value) || 10;
      state.reportPage = 1;
      renderReport(summary);
    });
  }

  els.reportBody.querySelectorAll("[data-report-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.reportPageAction;
      if (action === "prev" && state.reportPage > 1) {
        state.reportPage -= 1;
      } else if (action === "next" && state.reportPage < totalPages) {
        state.reportPage += 1;
      } else {
        return;
      }
      renderReport(summary);
    });
  });
}

function thaiMonthLabel(month) {
  const labels = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return labels[Number(month) - 1] || String(month);
}

function niceAxisMax(value) {
  if (!value || value <= 0) return 10;
  const padded = value * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function buildPpComboChart(months) {
  const n = months.length;
  if (!n) return "";

  const maxLeft = niceAxisMax(Math.max(...months.map((m) => Math.max(m.steelTon, m.otHours)), 1));
  const maxRight = niceAxisMax(Math.max(...months.map((m) => m.people), 1));

  const W = Math.max(600, n * 100);
  const H = 275;
  const pad = { top: 38, right: 55, bottom: 45, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const groupW = plotW / n;
  const barW = Math.min(19, groupW * 0.26);
  const gap = 4;
  const minBarHeightForLabel = 30;
  const xLabelY = pad.top + plotH + 23;
  const axisBaseY = pad.top + plotH;

  const yLeft = (v) => pad.top + plotH - (v / maxLeft) * plotH;
  const yRight = (v) => pad.top + plotH - (v / maxRight) * plotH;
  const xCenter = (i) => pad.left + groupW * i + groupW / 2;

  const barInsideLabel = (x, y, height, value, className) => {
    if (height < minBarHeightForLabel) return "";
    const labelY = y + Math.min(height - 6, 14);
    return `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" class="${className}">${formatNumber(value, 0)}</text>`;
  };

  const leftTicks = 4;
  const leftTickEls = [];
  const rightTickEls = [];
  for (let i = 0; i <= leftTicks; i += 1) {
    const t = (maxLeft / leftTicks) * i;
    const y = yLeft(t);
    leftTickEls.push(`
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" class="pp-grid" />
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="pp-axis-label">${formatNumber(t, t >= 1000 ? 0 : 1)}</text>
    `);
    const rt = (maxRight / leftTicks) * i;
    const yr = yRight(rt);
    rightTickEls.push(`
      <text x="${pad.left + plotW + 8}" y="${yr + 4}" text-anchor="start" class="pp-axis-label pp-axis-label--right">${formatNumber(rt, 0)}</text>
    `);
  }

  const bars = months
    .map((m, i) => {
      const cx = xCenter(i);
      const steelX = cx - barW - gap / 2;
      const otX = cx + gap / 2;
      const steelH = Math.max(2, (m.steelTon / maxLeft) * plotH);
      const otH = Math.max(2, (m.otHours / maxLeft) * plotH);
      const steelY = pad.top + plotH - steelH;
      const otY = pad.top + plotH - otH;

      return `
        <g class="pp-bar-group">
          <rect x="${steelX}" y="${steelY}" width="${barW}" height="${steelH}" rx="3" class="pp-svg-bar pp-svg-bar--steel">
            <title>ปริมาณเหล็ก: ${formatNumber(m.steelTon, 2)} ตัน</title>
          </rect>
          ${barInsideLabel(steelX, steelY, steelH, m.steelTon, "pp-svg-bar-label pp-svg-bar-label--inside-steel")}
          <rect x="${otX}" y="${otY}" width="${barW}" height="${otH}" rx="3" class="pp-svg-bar pp-svg-bar--ot">
            <title>จำนวนโอที: ${formatNumber(m.otHours, 2)} ชม.</title>
          </rect>
          ${barInsideLabel(otX, otY, otH, m.otHours, "pp-svg-bar-label pp-svg-bar-label--inside-ot")}
          <text x="${cx}" y="${xLabelY}" text-anchor="middle" class="pp-svg-x">${escapeHtml(m.label)}</text>
        </g>
      `;
    })
    .join("");

  const points = months.map((m, i) => ({
    x: xCenter(i),
    y: yRight(m.people),
    value: m.people,
    showLabel: n <= 8 || i % 2 === 0 || i === n - 1,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const lineEls = `
    <path d="${linePath}" class="pp-people-line" fill="none" />
    ${points
      .map((p, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        const labelX = p.x + side * 13;
        const anchor = side > 0 ? "start" : "end";
        const peopleLabel = p.showLabel
          ? `<text x="${labelX}" y="${p.y + 3}" text-anchor="${anchor}" class="pp-people-label">${formatNumber(p.value, 0)}</text>`
          : "";
        return `
      <circle cx="${p.x}" cy="${p.y}" r="4.5" class="pp-people-dot">
        <title>คน: ${formatNumber(p.value, 0)}</title>
      </circle>
      ${peopleLabel}
    `;
      })
      .join("")}
  `;

  return `
    <div class="pp-combo-wrap">
      <svg class="pp-combo-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟเหล็กและโอทีเทียบจำนวนคน">
        ${leftTickEls.join("")}
        ${rightTickEls.join("")}
        <line x1="${pad.left}" y1="${axisBaseY}" x2="${pad.left + plotW}" y2="${axisBaseY}" class="pp-axis-base" />
        ${lineEls}
        ${bars}
        <text x="${pad.left}" y="15" class="pp-axis-title">ตัน / ชม. OT</text>
        <text x="${pad.left + plotW}" y="15" text-anchor="end" class="pp-axis-title pp-axis-title--right">คน</text>
      </svg>
    </div>
  `;
}

function renderPpProductivity(payload) {
  if (!els.ppProductivity) return;
  const months = payload?.months || [];
  if (!months.length) {
    els.ppProductivity.innerHTML =
      '<div class="empty-state">ไม่มีข้อมูล ZHR_PP ในช่วงที่เลือก</div>';
    return;
  }

  const avg = payload.average || {};
  const columns = [
    ...months.map((m) => ({
      key: m.key,
      label: `${thaiMonthLabel(m.month)} ${String(m.year).slice(2)}`,
      people: m.people,
      steelTon: m.steelTon,
      otHours: m.otHours,
      tonPerHr: m.tonPerHr,
      hrPerTon: m.hrPerTon,
    })),
    {
      key: "avg",
      label: "ค่าเฉลี่ย",
      people: avg.people,
      steelTon: avg.steelTon,
      otHours: avg.otHours,
      tonPerHr: avg.tonPerHr,
      hrPerTon: avg.hrPerTon,
    },
  ];

  const chartMonths = columns.filter((c) => c.key !== "avg");
  const tonAvg = avg.tonPerHr;
  const hrAvg = avg.hrPerTon;

  const dataRows = [
    {
      label: "คน",
      get: (c) => formatNumber(c.people, c.key === "avg" ? 2 : 0),
      cls: () => "",
    },
    {
      label: "ปริมาณเหล็ก",
      get: (c) => formatNumber(c.steelTon, 2),
      cls: () => "",
    },
    {
      label: "จำนวนโอที",
      get: (c) => formatNumber(c.otHours, 2),
      cls: () => "",
    },
  ];

  const ratioRows = [
    {
      label: "1Hr = Ton",
      get: (c) => (c.tonPerHr == null ? "-" : formatNumber(c.tonPerHr, 3)),
      cls: (c) =>
        c.key !== "avg" && c.tonPerHr != null && tonAvg != null && c.tonPerHr >= tonAvg
          ? "pp-cell--good"
          : "",
    },
    {
      label: "1Ton = Hr",
      get: (c) => (c.hrPerTon == null ? "-" : formatNumber(c.hrPerTon, 3)),
      cls: (c) =>
        c.key !== "avg" && c.hrPerTon != null && hrAvg != null && c.hrPerTon > hrAvg
          ? "pp-cell--bad"
          : "",
    },
  ];

  function buildTable(rows, extraClass = "") {
    const head = `
      <tr>
        <th></th>
        ${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}
      </tr>`;
    const body = rows
      .map(
        (row) => `
      <tr>
        <th scope="row">${escapeHtml(row.label)}</th>
        ${columns
          .map((c) => `<td class="${row.cls(c)}">${row.get(c)}</td>`)
          .join("")}
      </tr>`,
      )
      .join("");
    return `<div class="table-wrap"><table class="pp-table ${extraClass}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  els.ppProductivity.innerHTML = `
    <div class="pp-legend">
      <span><i class="pp-swatch pp-swatch--steel"></i>ปริมาณเหล็ก (ตัน) — แท่ง</span>
      <span><i class="pp-swatch pp-swatch--ot"></i>จำนวนโอที (ชม.) — แท่ง</span>
      <span><i class="pp-swatch pp-swatch--people pp-swatch--line"></i>คน — เส้น (แกนขวา)</span>
    </div>
    ${buildPpComboChart(chartMonths)}
    ${buildTable(dataRows)}
    ${buildTable(ratioRows, "pp-table--ratio")}
  `;
}

async function loadPpProductivity() {
  if (!els.ppProductivity) return;
  if (state.ppProductivityPayload) {
    renderPpProductivity(state.ppProductivityPayload);
    return;
  }
  try {
    const range = getPpCalendarRange();
    const payload = await fetchPpProductivity({
      from: range.from,
      to: range.to,
      df_code: "all",
      department: "all",
    });
    state.ppProductivityPayload = payload;
    renderPpProductivity(payload);
  } catch (error) {
    els.ppProductivity.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function refresh() {
  const headcount = getHeadcount();
  const otRows = getFilteredOtRows();
  const summary = buildOvertimeSummary(otRows, headcount);
  const branchGroups = buildOvertimeGroupSummary(otRows, headcount, "branch");
  const deptGroups = buildOvertimeGroupSummary(otRows, headcount, "department");

  state.branchGroups = branchGroups;
  renderSummary(summary);
  renderGroupSummaryTable(els.branchSummaryBody, branchGroups);
  renderGroupSummaryTable(els.deptSummaryBody, deptGroups);
  renderBranchChart(branchGroups);
  renderGroupBars(deptGroups);
  renderReport(summary);
  updateRangeLabel(branchGroups, deptGroups);
  updateHero(branchGroups, deptGroups);
  syncUrl();
  loadPpProductivity();
}

async function loadData() {
  const key = `${state.filters.from}__${state.filters.to}__${state.filters.df_code}`;
  if (state.fetchedKey === key && state.rows.length) {
    refresh();
    return;
  }

  setLoading(true);
  try {
    const otPayload = await fetchOvertime({
      from: state.filters.from,
      to: state.filters.to,
      df_code: state.filters.df_code,
    });
    state.rows = otPayload.rows;
    state.fetchedKey = key;
    populateFilters();
    if (els.connectionStatus) {
      els.connectionStatus.textContent = `เชื่อมต่อแล้ว · OT ${formatNumber(otPayload.meta?.count ?? 0)} แถว · พนักงาน ${formatNumber(getHeadcount().totalEmployees)} คน`;
      els.connectionStatus.classList.remove("is-error");
    }
    refresh();
  } catch (error) {
    const message = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
    els.branchSummaryBody.innerHTML = message;
    els.deptSummaryBody.innerHTML = message;
    els.branchChartContent.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (els.branchCombinedChart) {
      els.branchCombinedChart.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    els.reportBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (els.ppProductivity && !state.ppProductivityPayload) {
      els.ppProductivity.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    if (els.connectionStatus) {
      els.connectionStatus.textContent = `⚠ ${error.message}`;
      els.connectionStatus.classList.add("is-error");
    }
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  const onRangeOrTypeChange = () => {
    state.reportPage = 1;
    state.filters.from = els.fromInput.value;
    state.filters.to = els.toInput.value;
    state.filters.df_code = els.dfCodeSelect.value;
    if (state.filters.from && state.filters.to && state.filters.from > state.filters.to) {
      [state.filters.from, state.filters.to] = [state.filters.to, state.filters.from];
      els.fromInput.value = state.filters.from;
      els.toInput.value = state.filters.to;
    }
    loadData();
  };

  els.fromInput.addEventListener("change", onRangeOrTypeChange);
  els.toInput.addEventListener("change", onRangeOrTypeChange);
  els.dfCodeSelect.addEventListener("change", onRangeOrTypeChange);
  els.branchSelect.addEventListener("change", (event) => {
    state.reportPage = 1;
    state.filters.branch = event.target.value;
    refresh();
  });
  els.departmentSelect.addEventListener("change", (event) => {
    state.reportPage = 1;
    state.filters.department = event.target.value;
    refresh();
  });
  els.branchChartTabs.forEach((button) => {
    button.addEventListener("click", () => {
      setBranchChartTab(button.dataset.branchTab);
    });
  });
  els.branchCombinedTabs.forEach((button) => {
    button.addEventListener("click", () => {
      setCombinedChartTab(button.dataset.combinedTab);
    });
  });
}

bindEvents();
setDefaults();
loadData();
