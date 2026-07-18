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
  formatLooseDate,
  formatNumber,
} from "./shared/format.js";

const els = {
  fromInput: document.getElementById("from-input"),
  toInput: document.getElementById("to-input"),
  dfCodeSelect: document.getElementById("df-code-select"),
  branchSelect: document.getElementById("branch-select"),
  departmentSelect: document.getElementById("department-select"),
  summaryGrid: document.getElementById("summary-grid"),
  otRateCompare: document.getElementById("ot-rate-compare"),
  branchSummaryBody: document.getElementById("branch-summary-body"),
  deptSummaryBody: document.getElementById("dept-summary-body"),
  branchCombinedChart: document.getElementById("branch-combined-chart"),
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
  branchGroups: [],
  deptGroups: [],
  filteredOtRows: [],
  headcount: null,
  selectedAvgBranch: null,
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

const OT_RATE_COMPARE = [
  { code: "1120", label: "1.5 เท่า", short: "X1.5", color: "#1d4ed8" },
  { code: "1130", label: "2 เท่า", short: "X2", color: "#d97706" },
  { code: "1140", label: "3 เท่า", short: "X3", color: "#c81e1e" },
];

function buildOtRateCompare(rows) {
  const buckets = OT_RATE_COMPARE.map((item) => ({
    ...item,
    hours: 0,
    people: new Set(),
  }));
  const byCode = new Map(buckets.map((item) => [item.code, item]));

  rows.forEach((row) => {
    const code = String(row.DF_CODE ?? "");
    const bucket = byCode.get(code);
    if (!bucket) return;
    const hours = Number(row.TMR_QTY_T) || 0;
    if (hours <= 0) return;
    bucket.hours += hours;
    const empKey = String(row.EMP_KEY || row.PRS_NO || "");
    if (empKey) bucket.people.add(empKey);
  });

  const totalHours = buckets.reduce((sum, item) => sum + item.hours, 0);
  const items = buckets.map((item) => ({
    code: item.code,
    label: item.label,
    short: item.short,
    color: item.color,
    hours: item.hours,
    people: item.people.size,
    share: totalHours > 0 ? (item.hours / totalHours) * 100 : 0,
  }));

  return {
    items,
    totalHours,
  };
}

function buildOtRateDonut(items, totalHours) {
  const stops = [];
  let cursor = 0;
  items.forEach((item) => {
    if (item.hours <= 0) return;
    const next = cursor + item.share;
    stops.push(`${item.color} ${cursor.toFixed(2)}% ${next.toFixed(2)}%`);
    cursor = next;
  });

  if (!stops.length) {
    stops.push("#e2e8f0 0% 100%");
  }

  return `
    <div
      class="ot-rate-donut"
      style="background: conic-gradient(${stops.join(", ")})"
      role="img"
      aria-label="สัดส่วนชั่วโมง OT ตามอัตรา"
    >
      <div class="ot-rate-donut-hole">
        <strong>${formatNumber(totalHours, 0)}</strong>
        <span>ชม. รวม</span>
      </div>
    </div>`;
}

function renderOtRateCompare(rows) {
  if (!els.otRateCompare) return;

  const { items, totalHours } = buildOtRateCompare(rows);

  if (totalHours <= 0) {
    els.otRateCompare.innerHTML =
      '<div class="empty-state">ไม่พบ OT อัตรา 1.5 / 2 / 3 เท่าในช่วงที่เลือก</div>';
    return;
  }

  const rowsHtml = items
    .map((item) => {
      const avgHours = item.people > 0 ? item.hours / item.people : 0;
      return `
        <div class="ot-rate-row">
          <div class="ot-rate-row-head">
            <span class="ot-rate-dot" style="background:${item.color}"></span>
            <span class="ot-rate-row-name">${escapeHtml(item.short)}</span>
            <span class="ot-rate-row-label">${escapeHtml(item.label)}</span>
            <strong class="ot-rate-row-pct">${formatNumber(item.share, 1)}%</strong>
          </div>
          <div class="ot-rate-row-track" aria-hidden="true">
            <div class="ot-rate-row-fill" style="width:${item.share.toFixed(2)}%; background:${item.color}"></div>
          </div>
          <div class="ot-rate-row-meta">
            <span>${formatNumber(item.hours, 1)} ชม. · เฉลี่ย ${formatNumber(avgHours, 2)} ชม./คน</span>
            <span>${formatNumber(item.people)} คน</span>
          </div>
        </div>`;
    })
    .join("");

  els.otRateCompare.innerHTML = `
    <div class="ot-rate-layout">
      ${buildOtRateDonut(items, totalHours)}
      <div class="ot-rate-rows">${rowsHtml}</div>
    </div>
  `;
}

function renderSummary(summary) {
  const cards = [
    { label: "พนักงานทั้งหมด", value: summary.totalEmployees, unit: "คน", tone: "slate" },
    { label: "พนักงานทำ OT", value: summary.people, unit: "คน", tone: "blue" },
    { label: "รวมชม. OT", value: summary.totalHours, unit: "ชม.", digits: 1, tone: "red" },
    {
      label: "เฉลี่ยชม./คน",
      value: summary.avgHoursPerEmployee,
      unit: "ชม.",
      digits: 2,
      tone: "orange",
    },
  ];

  els.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="ot-focus-kpi ot-focus-kpi--${card.tone}">
          <div class="ot-focus-label">${card.label}</div>
          <div class="ot-focus-value">
            ${formatNumber(card.value, card.digits ?? 0)}
            <span>${card.unit}</span>
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

function renderAvgBarList(groups, { selectedCode = null, selectable = false } = {}) {
  if (!groups.length) {
    return '<div class="empty-state">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>';
  }

  const max = Math.max(...groups.map((group) => group.avgHoursPerEmployee), 0.01);
  return `
    <div class="avg-bar-list">
      ${groups
        .map((group, index) => {
          const width = ((group.avgHoursPerEmployee / max) * 100).toFixed(2);
          const color = group.isTotal ? "#0f172a" : getCombinedSeriesColor(index);
          const selected = selectedCode && selectedCode === group.code ? " is-selected" : "";
          const tag = selectable ? "button" : "div";
          const typeAttr = selectable ? ' type="button"' : "";
          const dataAttr = selectable ? ` data-avg-branch="${escapeHtml(group.code)}"` : "";
          return `
            <${tag} class="avg-bar-row${selected}${selectable ? " is-selectable" : ""}"${typeAttr}${dataAttr}>
              <div class="avg-bar-name" title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</div>
              <div class="avg-bar-track">
                <div class="avg-bar-fill" style="width:${width}%; background:${color}"></div>
              </div>
              <div class="avg-bar-meta">
                <strong>${formatNumber(group.avgHoursPerEmployee, 2)}</strong>
                <span>ชม./คน · ${formatNumber(group.totalHours, 1)} ชม.</span>
              </div>
            </${tag}>`;
        })
        .join("")}
    </div>`;
}

function renderBranchCombinedChart(branchGroups) {
  if (!els.branchCombinedChart) return;

  const branches = [...branchGroups].sort(
    (a, b) =>
      b.avgHoursPerEmployee - a.avgHoursPerEmployee ||
      b.totalHours - a.totalHours ||
      a.name.localeCompare(b.name, "th"),
  );

  if (!branches.length) {
    els.branchCombinedChart.innerHTML =
      '<div class="empty-state">ไม่พบข้อมูล OT ตามเงื่อนไขที่เลือก</div>';
    return;
  }

  if (
    state.selectedAvgBranch &&
    !branches.some((branch) => branch.code === state.selectedAvgBranch)
  ) {
    state.selectedAvgBranch = null;
  }

  const selectedCode = state.selectedAvgBranch;
  const selectedBranch = selectedCode
    ? branches.find((branch) => branch.code === selectedCode)
    : null;
  const headcount = state.headcount || { branches: [], departments: [] };

  let deptRows;
  let rightTitle;
  let rightDesc;

  if (selectedCode) {
    const branchOtRows = (state.filteredOtRows || []).filter(
      (row) => normalizeBranchCode(row.BR_CODE) === selectedCode,
    );
    const branchHeadcount = {
      ...headcount,
      departments: (headcount.departments || []).filter(
        (dept) => dept.branchCode === selectedCode,
      ),
    };
    deptRows = buildOvertimeGroupSummary(branchOtRows, branchHeadcount, "department");
    rightTitle = `เฉลี่ย OT แผนก · ${selectedBranch?.name || selectedCode}`;
    rightDesc = `${formatNumber(deptRows.length)} แผนกของสาขาที่เลือก`;
  } else {
    const allDepts = [...(state.deptGroups || [])]
      .sort(
        (a, b) =>
          b.avgHoursPerEmployee - a.avgHoursPerEmployee ||
          b.totalHours - a.totalHours ||
          a.name.localeCompare(b.name, "th"),
      )
      .slice(0, 10)
      .map((dept) => ({
        ...dept,
        name: dept.branchCode ? `${dept.name} · ${dept.branchCode}` : dept.name,
      }));
    deptRows = allDepts;
    rightTitle = "เฉลี่ย OT แผนก · TOP 10";
    rightDesc = "ค่าเริ่มต้นแสดง 10 แผนกเฉลี่ยสูงสุด · คลิกสาขาซ้ายเพื่อกรอง";
  }

  const clearBtn = selectedCode
    ? `<button type="button" class="avg-clear-btn" data-avg-clear>ล้างการเลือกสาขา</button>`
    : "";

  els.branchCombinedChart.innerHTML = `
    <div class="avg-pair-board">
      <section class="avg-pair-panel">
        <div class="avg-pair-head avg-pair-head--with-action">
          <div>
            <h3>เฉลี่ย OT แต่ละสาขา</h3>
            <p>คลิกสาขาเพื่อดูแผนกในกราฟขวา</p>
          </div>
          ${clearBtn}
        </div>
        ${renderAvgBarList(branches, { selectedCode, selectable: true })}
      </section>
      <section class="avg-pair-panel">
        <div class="avg-pair-head">
          <h3>${escapeHtml(rightTitle)}</h3>
          <p>${escapeHtml(rightDesc)}</p>
        </div>
        ${renderAvgBarList(deptRows)}
      </section>
    </div>`;

  els.branchCombinedChart.querySelectorAll("[data-avg-branch]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAvgBranch = button.dataset.avgBranch;
      renderBranchCombinedChart(state.branchGroups);
    });
  });

  const clearButton = els.branchCombinedChart.querySelector("[data-avg-clear]");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.selectedAvgBranch = null;
      renderBranchCombinedChart(state.branchGroups);
    });
  }
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

  const maxLeft = niceAxisMax(Math.max(...months.map((m) => m.otHours || 0), 1));
  const ratioValues = months.map((m) => (Number.isFinite(m.tonPerHr) ? m.tonPerHr : 0));
  const maxRight = niceAxisMax(Math.max(...ratioValues, 0.01));

  const W = Math.max(640, n * 110);
  const H = 300;
  const pad = { top: 48, right: 62, bottom: 48, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const groupW = plotW / n;
  const barW = Math.min(34, groupW * 0.36);
  const xLabelY = pad.top + plotH + 24;
  const axisBaseY = pad.top + plotH;

  const yLeft = (v) => pad.top + plotH - (v / maxLeft) * plotH;
  const yRight = (v) => pad.top + plotH - (v / maxRight) * plotH;
  const xCenter = (i) => pad.left + groupW * i + groupW / 2;

  const tickCount = 4;
  const leftTickEls = [];
  const rightTickEls = [];
  for (let i = 0; i <= tickCount; i += 1) {
    const t = (maxLeft / tickCount) * i;
    const y = yLeft(t);
    leftTickEls.push(`
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" class="pp-grid" />
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="pp-axis-label">${formatNumber(t, t >= 1000 ? 0 : 1)}</text>
    `);
    const rt = (maxRight / tickCount) * i;
    const yr = yRight(rt);
    rightTickEls.push(`
      <text x="${pad.left + plotW + 8}" y="${yr + 4}" text-anchor="start" class="pp-axis-label pp-axis-label--right">${formatNumber(rt, rt >= 1 ? 2 : 3)}</text>
    `);
  }

  const bars = months
    .map((m, i) => {
      const cx = xCenter(i);
      const otX = cx - barW / 2;
      const otH = Math.max(2, ((m.otHours || 0) / maxLeft) * plotH);
      const otY = pad.top + plotH - otH;
      const otLabelX = otX - 4;
      const otLabelY = Math.max(18, otY - 8);
      return `
        <g class="pp-bar-group">
          <rect x="${otX}" y="${otY}" width="${barW}" height="${otH}" rx="3" class="pp-svg-bar pp-svg-bar--ot">
            <title>จำนวนโอที: ${formatNumber(m.otHours, 2)} ชม.</title>
          </rect>
          <text x="${otLabelX}" y="${otLabelY}" text-anchor="end" class="pp-svg-bar-label pp-svg-bar-label--ot-out">${formatNumber(m.otHours, 0)}</text>
          <text x="${cx}" y="${xLabelY}" text-anchor="middle" class="pp-svg-x">${escapeHtml(m.label)}</text>
        </g>
      `;
    })
    .join("");

  const points = months
    .map((m, i) => {
      if (!Number.isFinite(m.tonPerHr)) return null;
      return {
        x: xCenter(i),
        y: yRight(m.tonPerHr),
        value: m.tonPerHr,
        index: i,
        showLabel: n <= 8 || i % 2 === 0 || i === n - 1,
      };
    })
    .filter(Boolean);

  let linePath = "";
  if (points.length === 1) {
    linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  } else if (points.length > 1) {
    linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      linePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
  }

  const lineEls = points.length
    ? `
    <path d="${linePath}" class="pp-ratio-line" fill="none" />
    ${points
      .map((p) => {
        const label = p.showLabel
          ? `<text x="${p.x + 12}" y="${Math.max(18, p.y - 10)}" text-anchor="start" class="pp-ratio-label">${formatNumber(p.value, 3)}</text>`
          : "";
        return `
      <circle cx="${p.x}" cy="${p.y}" r="4.5" class="pp-ratio-dot">
        <title>1Hr = Ton: ${formatNumber(p.value, 3)}</title>
      </circle>
      ${label}
    `;
      })
      .join("")}
  `
    : "";

  return `
    <div class="pp-combo-wrap">
      <svg class="pp-combo-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟโอทีเทียบแนวโน้ม 1Hr = Ton">
        ${leftTickEls.join("")}
        ${rightTickEls.join("")}
        <line x1="${pad.left}" y1="${axisBaseY}" x2="${pad.left + plotW}" y2="${axisBaseY}" class="pp-axis-base" />
        ${bars}
        ${lineEls}
        <text x="${pad.left}" y="15" class="pp-axis-title">ชม. OT</text>
        <text x="${pad.left + plotW}" y="15" text-anchor="end" class="pp-axis-title pp-axis-title--right">1Hr = Ton</text>
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
      <span><i class="pp-swatch pp-swatch--ot"></i>จำนวนโอที (ชม.) — แท่ง</span>
      <span><i class="pp-swatch pp-swatch--ratio pp-swatch--line"></i>1Hr = Ton — เส้น Trend (แกนขวา)</span>
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
  state.deptGroups = deptGroups;
  state.filteredOtRows = otRows;
  state.headcount = headcount;
  renderSummary(summary);
  renderGroupSummaryTable(els.branchSummaryBody, branchGroups);
  renderGroupSummaryTable(els.deptSummaryBody, deptGroups);
  renderBranchCombinedChart(branchGroups);
  renderReport(summary);
  updateRangeLabel(branchGroups, deptGroups);
  renderOtRateCompare(otRows);
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
}

bindEvents();
setDefaults();
loadData();
