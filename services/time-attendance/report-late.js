import { aggregateDailyRows, buildLateSummary } from "./shared/aggregate.js";
import { isLateRecord } from "./shared/df-code-map.js";
import { computeRealLateMinutes, formatLateBreakdown, formatLateMinutes } from "./shared/late-calc.js";
import { fetchAttendance } from "./shared/api.js";
import { normalizeBranchCode } from "./shared/ot-aggregate.js";
import {
  getDefaultRange,
  getExpandedFetchRange,
  parseUrlFilters,
  passesFilters as rowPassesFilters,
} from "./shared/filters.js";
import { escapeHtml, formatDisplayDate, formatNumber, formatShiftHours } from "./shared/format.js";

const els = {
  fromInput: document.getElementById("from-input"),
  toInput: document.getElementById("to-input"),
  branchSelect: document.getElementById("branch-select"),
  departmentSelect: document.getElementById("department-select"),
  summaryGrid: document.getElementById("summary-grid"),
  reportBody: document.getElementById("report-body"),
  rangeLabel: document.getElementById("range-label"),
  loadingBanner: document.getElementById("loading-banner"),
  connectionStatus: document.getElementById("connection-status"),
};

const state = {
  rows: [],
  dailyRows: [],
  filters: parseUrlFilters(new URLSearchParams(window.location.search)),
  fetchedRange: null,
};

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
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set("from", state.filters.from);
  params.set("to", state.filters.to);
  if (state.filters.branch !== "all") params.set("branch", state.filters.branch);
  if (state.filters.department !== "all") params.set("department", state.filters.department);
  history.replaceState(null, "", `?${params.toString()}`);
}

function populateFilters() {
  const branchMap = new Map();
  state.dailyRows.forEach((row) => {
    if (!branchMap.has(row.branchCode)) branchMap.set(row.branchCode, row.branchName);
  });

  const savedBranch = state.filters.branch;
  const savedDept = state.filters.department;

  els.branchSelect.innerHTML = '<option value="all">สาขาทั้งหมด</option>';
  [...branchMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "th"))
    .forEach(([code, name]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name && name !== code ? `${code} - ${name}` : code;
      els.branchSelect.append(option);
    });

  const departments = [
    ...new Map(state.dailyRows.map((row) => [row.departmentCode, row.departmentName])).entries(),
  ].sort((a, b) => a[0].localeCompare(b[0], "th"));

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

function getFilteredDaily() {
  return state.dailyRows.filter((row) => rowPassesFilters(row, state.filters));
}

function getFilteredRaw() {
  const eligibleKeys = new Set(
    getFilteredDaily()
      .filter((row) => row.lateTimes > 0 && row.absent === 0)
      .map((row) => `${row.empKey}__${row.date}`),
  );
  return state.rows.filter((row) => {
    const key = `${row.EMP_KEY}__${row.TMR_DATE}`;
    if (!eligibleKeys.has(key)) return false;
    if (state.filters.branch !== "all" && normalizeBranchCode(row.BR_CODE) !== state.filters.branch) return false;
    if (state.filters.department !== "all" && row.DEPT_CODE !== state.filters.department) return false;
    return true;
  });
}

function updateRangeLabel() {
  els.rangeLabel.textContent = `${formatDisplayDate(state.filters.from)} ถึง ${formatDisplayDate(state.filters.to)}`;
}

function renderSummary(lateSummary) {
  const cards = [
    { label: "พนักงานมาสาย", value: lateSummary.people, unit: "คน", color: "var(--color-late)" },
    { label: "จำนวนครั้ง", value: lateSummary.times, unit: "ครั้ง", color: "var(--color-late)" },
    { label: "นาทีสายจริง", value: lateSummary.minutes, unit: "นาที", color: "var(--orange)" },
    { label: "รายการต้นทาง", value: lateSummary.records.length, unit: "แถว", color: "var(--slate)" },
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

function groupRecordsByPerson(eligible, records) {
  const map = new Map();

  eligible.forEach((row) => {
    if (!map.has(row.empKey)) {
      map.set(row.empKey, {
        empKey: row.empKey,
        name: row.name,
        departmentCode: row.departmentCode,
        departmentName: row.departmentName,
        branchName: row.branchName,
        times: 0,
        minutes: 0,
        days: [],
        records: [],
      });
    }
    const entry = map.get(row.empKey);
    entry.times += row.lateTimes;
    entry.minutes += row.lateMinutes || 0;
    entry.days.push(row);
  });

  records.forEach((row) => {
    const key = String(row.EMP_KEY ?? "");
    if (!map.has(key)) return;
    map.get(key).records.push(row);
  });

  return [...map.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name, "th"));
}

function renderReport(lateSummary) {
  const people = groupRecordsByPerson(lateSummary.eligible, lateSummary.records);

  if (!people.length) {
    els.reportBody.innerHTML =
      '<div class="empty-state">ไม่พบรายการมาสายในช่วงที่เลือก (ไม่รวมวันที่ขาดงาน)</div>';
    return;
  }

  els.reportBody.innerHTML = people
    .map((person, index) => {
      const dayRows = person.days
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
        .map(
          (day) => `
            <tr>
              <td>${escapeHtml(day.date)}</td>
              <td>${escapeHtml(formatShiftHours(day.shift))}</td>
              <td>${escapeHtml(day.lateDetail?.scans?.join(" · ") || "-")}</td>
              <td>${escapeHtml(formatLateBreakdown(day.lateDetail))}</td>
              <td><strong>${escapeHtml(formatLateMinutes(day.lateMinutes))}</strong></td>
            </tr>`,
        )
        .join("");

      const seenDates = new Set();
      const recordRows = person.records
        .filter((rec) => isLateRecord(rec))
        .sort((a, b) => String(a.TMR_DATE).localeCompare(String(b.TMR_DATE)))
        .map((rec) => {
          const dateKey = String(rec.TMR_DATE);
          const showDetail = !seenDates.has(dateKey);
          if (showDetail) seenDates.add(dateKey);
          const detail = showDetail ? computeRealLateMinutes(rec) : null;
          return `
            <tr class="record-row">
              <td>${escapeHtml(rec.TMR_DATE)}</td>
              <td><code>${escapeHtml(rec.DF_CODE)}</code></td>
              <td>${escapeHtml(rec.DF_DESC || rec.DF_LEAVE || "-")}</td>
              <td>${showDetail ? escapeHtml(rec.TMT_STAMPINFO || "-") : "—"}</td>
              <td>${showDetail ? escapeHtml(formatLateBreakdown(detail)) : "—"}</td>
              <td>${showDetail ? `<strong>${escapeHtml(formatLateMinutes(detail?.total))}</strong>` : "—"}</td>
              <td>${formatNumber(rec.TMR_QTY, 2)}</td>
            </tr>`;
        })
        .join("");

      return `
        <article class="report-person panel">
          <button class="report-person-head" type="button" aria-expanded="false" data-target="person-${index}">
            <div>
              <strong>${escapeHtml(person.name)}</strong>
              <span class="report-meta">${escapeHtml(person.empKey)} · ${escapeHtml(person.departmentCode)} · ${escapeHtml(person.branchName)}</span>
            </div>
            <div class="report-person-stats">
              <span>${formatNumber(person.times)} ครั้ง</span>
              <span>${formatNumber(person.minutes)} นาที</span>
            </div>
            <span class="report-toggle">ดูรายละเอียดถึงต้นทาง</span>
          </button>
          <div class="report-person-body" id="person-${index}" hidden>
            <h3>สรุปรายวัน</h3>
            <div class="table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>วันที่</th><th>เวลาเข้างาน</th><th>สแกนทั้งหมด</th>
                    <th>รายละเอียดสาย</th><th>สายจริง</th>
                  </tr>
                </thead>
                <tbody>${dayRows}</tbody>
              </table>
            </div>
            <h3>ข้อมูลต้นทาง (vw_employee_checkin)</h3>
            <div class="table-wrap">
              <table class="record-table">
                <thead>
                  <tr>
                    <th>วันที่</th><th>DF_CODE</th><th>รายละเอียด</th>
                    <th>สแกนทั้งหมด</th><th>สายจริง</th><th>นาที</th><th>หัก (TMR_QTY)</th>
                  </tr>
                </thead>
                <tbody>${recordRows}</tbody>
              </table>
            </div>
          </div>
        </article>`;
    })
    .join("");

  els.reportBody.querySelectorAll(".report-person-head").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      target.hidden = expanded;
      button.classList.toggle("is-open", !expanded);
    });
  });
}

function refresh() {
  const filtered = getFilteredDaily();
  const rawFiltered = getFilteredRaw();
  const lateSummary = buildLateSummary(filtered, rawFiltered);
  renderSummary(lateSummary);
  renderReport(lateSummary);
  updateRangeLabel();
  syncUrl();
}

async function loadData() {
  const range = getExpandedFetchRange(state.filters);
  const key = `${range.from}__${range.to}`;
  if (state.fetchedRange === key && state.dailyRows.length) {
    refresh();
    return;
  }

  setLoading(true);
  try {
    const payload = await fetchAttendance({ ...state.filters, ...range });
    state.rows = payload.rows;
    state.dailyRows = aggregateDailyRows(state.rows);
    state.fetchedRange = key;
    populateFilters();
    if (els.connectionStatus) {
      els.connectionStatus.textContent = `เชื่อมต่อแล้ว · ${formatNumber(payload.meta?.count ?? 0)} แถว`;
    }
    refresh();
  } catch (error) {
    els.reportBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (els.connectionStatus) {
      els.connectionStatus.textContent = `⚠ ${error.message}`;
      els.connectionStatus.classList.add("is-error");
    }
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  const onRangeChange = () => {
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
    refresh();
  });
  els.departmentSelect.addEventListener("change", (event) => {
    state.filters.department = event.target.value;
    refresh();
  });
}

bindEvents();
setDefaults();
loadData();
