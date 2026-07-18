import { withBasePath } from "./shared/base-path.js";
import { checkApiHealth } from "./shared/api.js";
import { escapeHtml, formatNumber } from "./shared/format.js";

const THAI_MONTHS = [
  { value: 1, label: "มกราคม", short: "ม.ค." },
  { value: 2, label: "กุมภาพันธ์", short: "ก.พ." },
  { value: 3, label: "มีนาคม", short: "มี.ค." },
  { value: 4, label: "เมษายน", short: "เม.ย." },
  { value: 5, label: "พฤษภาคม", short: "พ.ค." },
  { value: 6, label: "มิถุนายน", short: "มิ.ย." },
  { value: 7, label: "กรกฎาคม", short: "ก.ค." },
  { value: 8, label: "สิงหาคม", short: "ส.ค." },
  { value: 9, label: "กันยายน", short: "ก.ย." },
  { value: 10, label: "ตุลาคม", short: "ต.ค." },
  { value: 11, label: "พฤศจิกายน", short: "พ.ย." },
  { value: 12, label: "ธันวาคม", short: "ธ.ค." },
];

/** ชุดข้อมูลกราฟ stacked — สีตามตัวอย่าง EMC */
const CHART_SERIES = [
  { key: "late", label: "มาสาย/คน", color: "#c62828", metrics: ["late"] },
  { key: "absent", label: "ขาดงาน/คน", color: "#1e3a5f", metrics: ["absent"] },
  { key: "business", label: "กิจ/คน", color: "#2a9d8f", metrics: ["business", "special"] },
  { key: "sick", label: "ป่วย/คน", color: "#c9a76c", metrics: ["sick_cert", "sick_no"] },
  { key: "vacation", label: "พักร้อน/คน", color: "#7c6a9c", metrics: ["vacation"] },
];

const els = {
  month: document.getElementById("month-select"),
  year: document.getElementById("year-select"),
  rangeLabel: document.getElementById("range-label"),
  status: document.getElementById("connection-status"),
  loading: document.getElementById("loading-banner"),
  body: document.getElementById("report-body"),
  chart: document.getElementById("emc-chart"),
  chartLegend: document.getElementById("emc-chart-legend"),
  workforce: document.getElementById("workforce-body"),
  turnover: document.getElementById("turnover-body"),
  laborPerTon: document.getElementById("labor-per-ton-body"),
};

/** สีช่อง treemap ตามรหัสกลุ่ม */
const BU_TREEMAP_COLOR_BY_CODE = {
  MMT: "#e8c547",
  SMK: "#7ec8e3",
  OCP: "#9b7bb8",
  KTB: "#5b8def",
  HRM: "#5ec8c8",
  FNA: "#6fbf73",
  ZEN: "#f0b429",
  DBS: "#3d9b8f",
  ITM: "#6b5b95",
  อื่นๆ: "#e07a5f",
};

const BU_TREEMAP_COLORS = Object.values(BU_TREEMAP_COLOR_BY_CODE);
const BU_TREEMAP_OTHER_COLOR = BU_TREEMAP_COLOR_BY_CODE["อื่นๆ"];

let workforceCache = null;
let workforceCacheKey = "";
let turnoverCache = null;

function workforceKey(filters) {
  return `${filters.year}-${filters.month}`;
}

function getCalendarPeriod() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}


function parseFilters() {
  const params = new URLSearchParams(window.location.search);
  const now = new Date();
  const month = Number(params.get("month")) || now.getMonth() + 1;
  const year = Number(params.get("year")) || now.getFullYear();
  return {
    month: Math.min(12, Math.max(1, month)),
    year,
  };
}

function writeUrl(filters) {
  const params = new URLSearchParams();
  params.set("month", String(filters.month));
  params.set("year", String(filters.year));
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
}

function fillSelectors(filters) {
  const nowYear = new Date().getFullYear();
  els.month.innerHTML = THAI_MONTHS.map(
    (m) =>
      `<option value="${m.value}" ${m.value === filters.month ? "selected" : ""}>${m.label}</option>`,
  ).join("");

  const years = [];
  for (let y = nowYear; y >= nowYear - 5; y -= 1) years.push(y);
  if (!years.includes(filters.year)) years.push(filters.year);
  years.sort((a, b) => b - a);

  els.year.innerHTML = years
    .map((y) => `<option value="${y}" ${y === filters.year ? "selected" : ""}>${y}</option>`)
    .join("");
}

async function fetchEmc(filters) {
  const params = new URLSearchParams({
    month: String(filters.month),
    year: String(filters.year),
  });
  const response = await fetch(`${withBasePath("/api/emc")}?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลดรายงาน EMC ได้");
  }
  return payload;
}

async function fetchWorkforce(filters) {
  const params = new URLSearchParams({
    month: String(filters.month),
    year: String(filters.year),
  });
  const response = await fetch(`${withBasePath("/api/emc/workforce")}?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลด Workforce Overview ได้");
  }
  return payload;
}

async function fetchTurnover(year) {
  const response = await fetch(`${withBasePath("/api/emc/turnover")}?year=${encodeURIComponent(year)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลด Turnover Rate ได้");
  }
  return payload;
}

async function fetchLaborPerTon(filters) {
  const params = new URLSearchParams({
    year: String(filters.year),
    month: String(filters.month),
  });
  const response = await fetch(`${withBasePath("/api/emc/labor-per-ton")}?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลดค่าแรงต่อตันได้");
  }
  return payload;
}

const LABOR_LINE_COLORS = [
  "#1d4ed8",
  "#c81e1e",
  "#0e7490",
  "#d97706",
  "#7c3aed",
  "#15803d",
  "#db2777",
  "#475569",
];

function laborMonthLabels(monthKeys) {
  return monthKeys.map((key) => {
    const month = Number(key.slice(5, 7));
    return THAI_MONTHS.find((item) => item.value === month)?.short || key;
  });
}

function formatCompactLabor(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${formatNumber(n / 1_000_000, 1)}ล`;
  if (n >= 1_000) return `${formatNumber(n / 1_000, 0)}พ`;
  return formatNumber(n, 0);
}

function renderLaborLegend(series) {
  return series
    .map((item, index) => {
      const color = LABOR_LINE_COLORS[index % LABOR_LINE_COLORS.length];
      return `<button type="button" class="emc-labor-legend-item emc-labor-legend-btn" data-labor-code="${escapeHtml(item.code)}" style="--labor-color:${color}">
        <i style="background:${color}"></i>${escapeHtml(item.name)}
      </button>`;
    })
    .join("");
}

function laborTotalOf(point) {
  return (Number(point?.salary) || 0) + (Number(point?.ot) || 0);
}

function renderLaborTotalLineChart(title, series, monthKeys) {
  if (!series?.length || !monthKeys?.length) {
    return `
      <article class="emc-labor-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state">ไม่มีข้อมูลในช่วงที่เลือก</div>
      </article>`;
  }

  const labels = laborMonthLabels(monthKeys);
  const laborValues = series.flatMap((item) => item.points.map((point) => laborTotalOf(point)));
  const maxLabor = Math.max(0, ...laborValues);
  if (maxLabor <= 0) {
    return `
      <article class="emc-labor-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state">ไม่มีข้อมูลค่าแรงในช่วงที่เลือก</div>
      </article>`;
  }

  const laborMax = Math.max(1, maxLabor * 1.15);
  const ticks = 4;
  const width = 920;
  const height = 280;
  const pad = { top: 28, right: 20, bottom: 42, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const denom = Math.max(1, monthKeys.length - 1);
  const xOf = (index) => pad.left + (plotW / denom) * index;
  const yOf = (value) => pad.top + plotH - (value / laborMax) * plotH;

  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const tick = (laborMax / ticks) * index;
    const y = yOf(tick);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" class="emc-labor-grid"></line>
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="emc-labor-axis">${formatNumber(tick, 0)}</text>`;
  }).join("");

  const xLabels = labels
    .map(
      (label, index) =>
        `<text x="${xOf(index)}" y="${height - 14}" text-anchor="middle" class="emc-labor-axis">${escapeHtml(label)}</text>`,
    )
    .join("");

  const lines = series
    .map((item, sIndex) => {
      const color = LABOR_LINE_COLORS[sIndex % LABOR_LINE_COLORS.length];
      const coords = item.points
        .map((point, mIndex) => {
          const labor = laborTotalOf(point);
          return labor > 0 ? { x: xOf(mIndex), y: yOf(labor), labor, point } : null;
        })
        .filter(Boolean);
      if (!coords.length) return "";
      const path = coords
        .map((c, index) => `${index === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(" ");
      const dots = coords
        .map((c) => {
          const tip = `${item.name} ${c.point.month}: ${formatNumber(c.labor, 0)} บาท (ค่าแรง ${formatNumber(c.point.salary, 0)} · OT ${formatNumber(c.point.ot, 0)})`;
          return `
            <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1" class="emc-labor-series-dot">
              <title>${escapeHtml(tip)}</title>
            </circle>
            <text x="${c.x}" y="${Math.max(pad.top + 10, c.y - 8)}" text-anchor="middle" class="emc-labor-value-label" fill="${color}">${formatCompactLabor(c.labor)}</text>`;
        })
        .join("");
      return `
        <g class="emc-labor-series" data-labor-code="${escapeHtml(item.code)}" tabindex="0" role="button" aria-label="${escapeHtml(item.name)}">
          <path d="${path}" fill="none" stroke="transparent" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" class="emc-labor-series-hit"></path>
          <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="emc-labor-series-line"></path>
          ${dots}
        </g>`;
    })
    .join("");

  return `
    <article class="emc-labor-card">
      <h3>${escapeHtml(title)}</h3>
      <p class="emc-labor-card-desc">เส้น = ค่าแรงรวม (เงินเดือน+โอที) หน่วยบาท · คลิกเส้นหรือตำนานเพื่อไฮไลท์</p>
      <div class="emc-labor-legend">${renderLaborLegend(series)}</div>
      <div class="emc-labor-chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" class="emc-labor-chart" role="img" aria-label="${escapeHtml(title)}">
          <text x="${pad.left}" y="16" class="emc-labor-axis-title">บาท</text>
          ${grid}
          ${lines}
          ${xLabels}
        </svg>
      </div>
    </article>`;
}

function renderLaborRatioChart(title, series, monthKeys) {
  if (!series?.length || !monthKeys?.length) {
    return `
      <article class="emc-labor-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state">ไม่มีข้อมูลในช่วงที่เลือก</div>
      </article>`;
  }

  const labels = laborMonthLabels(monthKeys);
  const ratioValues = series.flatMap((item) =>
    item.points.map((point) => point.laborPerTon).filter((value) => Number.isFinite(value)),
  );
  if (!ratioValues.length) {
    return `
      <article class="emc-labor-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state">ไม่มีค่าบาท/ตันที่คำนวณได้</div>
      </article>`;
  }

  const ratioMax = Math.max(1, Math.max(...ratioValues) * 1.15);
  const ticks = 4;
  const width = 920;
  const height = 280;
  const pad = { top: 28, right: 20, bottom: 42, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const denom = Math.max(1, monthKeys.length - 1);
  const xOf = (index) => pad.left + (plotW / denom) * index;
  const yOf = (value) => pad.top + plotH - (value / ratioMax) * plotH;

  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const tick = (ratioMax / ticks) * index;
    const y = yOf(tick);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" class="emc-labor-grid"></line>
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="emc-labor-axis">${formatNumber(tick, 0)}</text>`;
  }).join("");

  const xLabels = labels
    .map(
      (label, index) =>
        `<text x="${xOf(index)}" y="${height - 14}" text-anchor="middle" class="emc-labor-axis">${escapeHtml(label)}</text>`,
    )
    .join("");

  const lines = series
    .map((item, sIndex) => {
      const color = LABOR_LINE_COLORS[sIndex % LABOR_LINE_COLORS.length];
      const coords = item.points
        .map((point, mIndex) =>
          Number.isFinite(point.laborPerTon)
            ? { x: xOf(mIndex), y: yOf(point.laborPerTon), point }
            : null,
        )
        .filter(Boolean);
      if (!coords.length) return "";
      const path = coords
        .map((c, index) => `${index === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(" ");
      const dots = coords
        .map((c) => {
          const tip = `${item.name} ${c.point.month}: ${formatNumber(c.point.laborPerTon, 0)} บาท/ตัน`;
          return `
            <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1" class="emc-labor-series-dot">
              <title>${escapeHtml(tip)}</title>
            </circle>
            <text x="${c.x}" y="${Math.max(pad.top + 10, c.y - 8)}" text-anchor="middle" class="emc-labor-value-label" fill="${color}">${formatNumber(c.point.laborPerTon, 0)}</text>`;
        })
        .join("");
      // Invisible wider stroke for easier click
      return `
        <g class="emc-labor-series" data-labor-code="${escapeHtml(item.code)}" tabindex="0" role="button" aria-label="${escapeHtml(item.name)}">
          <path d="${path}" fill="none" stroke="transparent" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" class="emc-labor-series-hit"></path>
          <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="emc-labor-series-line"></path>
          ${dots}
        </g>`;
    })
    .join("");

  return `
    <article class="emc-labor-card emc-labor-card--ratio">
      <h3>${escapeHtml(title)}</h3>
      <p class="emc-labor-card-desc">เส้น = (เงินเดือน+โอที) ÷ ตันผลิต · คลิกเส้นหรือตำนานเพื่อไฮไลท์</p>
      <div class="emc-labor-legend">${renderLaborLegend(series)}</div>
      <div class="emc-labor-chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" class="emc-labor-chart emc-labor-chart--ratio" role="img" aria-label="${escapeHtml(title)}">
          <text x="${pad.left}" y="16" class="emc-labor-axis-title">บาท/ตัน</text>
          ${grid}
          ${lines}
          ${xLabels}
        </svg>
      </div>
    </article>`;
}

function otPerTonOf(point) {
  const ton = Number(point?.ton) || 0;
  const ot = Number(point?.ot) || 0;
  return ton > 0 ? ot / ton : null;
}

function renderOtPerTonChart(title, series, monthKeys) {
  if (!series?.length || !monthKeys?.length) {
    return `
      <article class="emc-labor-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state">ไม่มีข้อมูลในช่วงที่เลือก</div>
      </article>`;
  }

  const labels = laborMonthLabels(monthKeys);
  const ratioValues = series.flatMap((item) =>
    item.points.map((point) => otPerTonOf(point)).filter((value) => Number.isFinite(value)),
  );
  if (!ratioValues.length) {
    return `
      <article class="emc-labor-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state">ไม่มีค่า OT/ตันที่คำนวณได้</div>
      </article>`;
  }

  const ratioMax = Math.max(1, Math.max(...ratioValues) * 1.15);
  const ticks = 4;
  const width = 920;
  const height = 280;
  const pad = { top: 28, right: 20, bottom: 42, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const denom = Math.max(1, monthKeys.length - 1);
  const xOf = (index) => pad.left + (plotW / denom) * index;
  const yOf = (value) => pad.top + plotH - (value / ratioMax) * plotH;

  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const tick = (ratioMax / ticks) * index;
    const y = yOf(tick);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" class="emc-labor-grid"></line>
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="emc-labor-axis">${formatNumber(tick, 0)}</text>`;
  }).join("");

  const xLabels = labels
    .map(
      (label, index) =>
        `<text x="${xOf(index)}" y="${height - 14}" text-anchor="middle" class="emc-labor-axis">${escapeHtml(label)}</text>`,
    )
    .join("");

  const lines = series
    .map((item, sIndex) => {
      const color = LABOR_LINE_COLORS[sIndex % LABOR_LINE_COLORS.length];
      const coords = item.points
        .map((point, mIndex) => {
          const value = otPerTonOf(point);
          return Number.isFinite(value) ? { x: xOf(mIndex), y: yOf(value), value, point } : null;
        })
        .filter(Boolean);
      if (!coords.length) return "";
      const path = coords
        .map((c, index) => `${index === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(" ");
      const dots = coords
        .map((c) => {
          const tip = `${item.name} ${c.point.month}: ${formatNumber(c.value, 0)} OT บาท/ตัน (OT ${formatNumber(c.point.ot, 0)} · ตัน ${formatNumber(c.point.ton, 1)})`;
          return `
            <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1" class="emc-labor-series-dot">
              <title>${escapeHtml(tip)}</title>
            </circle>
            <text x="${c.x}" y="${Math.max(pad.top + 10, c.y - 8)}" text-anchor="middle" class="emc-labor-value-label" fill="${color}">${formatNumber(c.value, 0)}</text>`;
        })
        .join("");
      return `
        <g class="emc-labor-series" data-labor-code="${escapeHtml(item.code)}" tabindex="0" role="button" aria-label="${escapeHtml(item.name)}">
          <path d="${path}" fill="none" stroke="transparent" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" class="emc-labor-series-hit"></path>
          <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="emc-labor-series-line"></path>
          ${dots}
        </g>`;
    })
    .join("");

  return `
    <article class="emc-labor-card emc-labor-card--ratio">
      <h3>${escapeHtml(title)}</h3>
      <p class="emc-labor-card-desc">เส้น = โอที ÷ ตันผลิต · แยกตาม Location · คลิกเส้นหรือตำนานเพื่อไฮไลท์</p>
      <div class="emc-labor-legend">${renderLaborLegend(series)}</div>
      <div class="emc-labor-chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" class="emc-labor-chart emc-labor-chart--ratio" role="img" aria-label="${escapeHtml(title)}">
          <text x="${pad.left}" y="16" class="emc-labor-axis-title">OT บาท/ตัน</text>
          ${grid}
          ${lines}
          ${xLabels}
        </svg>
      </div>
    </article>`;
}

function renderOtPerTonSection(series, monthKeys) {
  if (!series?.length) {
    return `
      <section class="emc-labor-block">
        <header class="emc-labor-block-head"><h3>Location · OT ต่อตัน</h3></header>
        <div class="empty-state">ไม่มีข้อมูลในช่วงที่เลือก</div>
      </section>`;
  }
  const blockId = "labor-block-location-ot-per-ton";
  return `
    <section class="emc-labor-block" data-labor-block="${blockId}" id="${blockId}">
      <header class="emc-labor-block-head"><h3>Location (Top 8) · OT ต่อตัน</h3></header>
      ${renderOtPerTonChart("Location (Top 8) · OT ต่อตัน (บาท/ตัน)", series, monthKeys)}
    </section>`;
}

function renderLaborSection(sectionTitle, series, monthKeys, { showTotalChart = true, showDataTable = true } = {}) {
  if (!series?.length) {
    return `
      <section class="emc-labor-block">
        <header class="emc-labor-block-head"><h3>${escapeHtml(sectionTitle)}</h3></header>
        <div class="empty-state">ไม่มีข้อมูลในช่วงที่เลือก</div>
      </section>`;
  }

  const labels = laborMonthLabels(monthKeys);
  const blockId = `labor-block-${String(sectionTitle).replace(/[^a-zA-Z0-9ก-๙]+/g, "-")}`;
  const totalHtml = showTotalChart
    ? renderLaborTotalLineChart(`${sectionTitle} · ค่าแรงรวมรายเดือน (บาท)`, series, monthKeys)
    : "";
  const tableHtml = showDataTable
    ? `
      <details class="emc-labor-table-details" open>
        <summary class="emc-labor-table-summary">
          <span>ตาราง · ค่าแรง / โอที / ผลิต (ตัน)</span>
          <span class="emc-labor-table-hint">คลิกเพื่อเปิด-ปิด · คลิกแถวเพื่อไฮไลท์กราฟ</span>
        </summary>
        <div class="emc-labor-table-block">
          ${renderLaborDataTable(series, monthKeys, labels)}
        </div>
      </details>`
    : "";
  return `
    <section class="emc-labor-block" data-labor-block="${escapeHtml(blockId)}" id="${escapeHtml(blockId)}">
      <header class="emc-labor-block-head"><h3>${escapeHtml(sectionTitle)}</h3></header>
      ${totalHtml}
      ${renderLaborRatioChart(`${sectionTitle} · ค่าแรงต่อตัน (บาท/ตัน)`, series, monthKeys)}
      ${tableHtml}
    </section>`;
}

function renderLaborDataTable(series, monthKeys, labels) {
  if (!series?.length || !monthKeys?.length) return "";

  const metricDefs = [
    { key: "salary", label: "ค่าแรง", digits: 0 },
    { key: "ot", label: "โอที", digits: 0 },
    { key: "ton", label: "ผลิต (ตัน)", digits: 1 },
  ];

  const head = `
    <tr>
      <th scope="col">รายการ</th>
      ${labels.map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join("")}
    </tr>`;

  const body = series
    .flatMap((item) =>
      metricDefs.map((metric) => {
        const cells = monthKeys
          .map((_, index) => {
            const point = item.points[index] || {};
            const value = Number(point[metric.key]) || 0;
            return `<td>${formatNumber(value, metric.digits)}</td>`;
          })
          .join("");
        return `
          <tr class="emc-labor-table-row" data-labor-code="${escapeHtml(item.code)}" tabindex="0" role="button">
            <th scope="row">${escapeHtml(item.name)} · ${escapeHtml(metric.label)}</th>
            ${cells}
          </tr>`;
      }),
    )
    .join("");

  return `
    <div class="emc-labor-table-wrap">
      <table class="emc-labor-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function setLaborHighlight(block, code) {
  if (!block) return;
  const active = code || null;
  const current = block.dataset.laborActive || "";
  const next = active && current === active ? "" : active || "";
  if (next) block.dataset.laborActive = next;
  else delete block.dataset.laborActive;

  block.classList.toggle("has-labor-highlight", Boolean(next));

  block.querySelectorAll("[data-labor-code]").forEach((el) => {
    const match = next && el.dataset.laborCode === next;
    el.classList.toggle("is-labor-active", Boolean(match));
    el.classList.toggle("is-labor-dimmed", Boolean(next) && !match);
  });
}

function bindLaborHighlight(container) {
  if (!container) return;
  container.querySelectorAll(".emc-labor-block").forEach((block) => {
    block.addEventListener("click", (event) => {
      const target = event.target.closest("[data-labor-code]");
      if (!target || !block.contains(target)) return;
      event.preventDefault();
      setLaborHighlight(block, target.dataset.laborCode);
    });
    block.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest("[data-labor-code]");
      if (!target || !block.contains(target)) return;
      event.preventDefault();
      setLaborHighlight(block, target.dataset.laborCode);
    });
  });
}

function renderLaborPerTon(payload) {
  if (!els.laborPerTon) return;
  const months = payload?.months || [];
  const branch = payload?.branch?.series || [];
  const location = payload?.location?.series || [];
  const omitted = payload?.meta?.locationOmitted || 0;

  if (!branch.length && !location.length) {
    els.laborPerTon.innerHTML = `<div class="empty-state">ไม่มีข้อมูลค่าแรง/ตันในช่วงที่เลือก</div>`;
    return;
  }

  const note = omitted
    ? `<p class="emc-labor-note">Location แสดง Top 8 ตามยอดค่าแรง YTD · ละไว้ ${formatNumber(omitted)} รายการ</p>`
    : "";

  els.laborPerTon.innerHTML = `
    <div class="emc-labor-stack">
      ${renderLaborSection("สาขา · ZUBB / OCP", branch, months)}
      ${renderLaborSection("Location (Top 8)", location, months, { showTotalChart: false, showDataTable: false })}
      ${renderOtPerTonSection(location, months)}
    </div>
    ${note}`;
  bindLaborHighlight(els.laborPerTon);
}

function buildDonutSlices(entries, total) {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return entries
    .map((item) => {
      const length = total ? (item.count / total) * circumference : 0;
      const segment = `
        <circle cx="120" cy="120" r="${radius}" fill="none" style="stroke:${item.color}"
          stroke-width="28" stroke-dasharray="${length} ${circumference - length}"
          stroke-dashoffset="${-offset}" transform="rotate(-90 120 120)"></circle>`;
      offset += length;
      return segment;
    })
    .join("");
}

function renderGenderDonut(gender) {
  const total = gender.total || 0;
  const items = gender.items.filter((item) => item.count > 0);
  if (!total || !items.length) {
    return `<div class="workforce-card"><h3>Total Employee By Gender</h3><div class="empty-state">ไม่มีข้อมูลเพศ</div></div>`;
  }

  const legend = items
    .map((item) => {
      const pct = total ? Math.round((item.count / total) * 100) : 0;
      return `
        <div class="wf-gender-legend-item">
          <span class="emc-chart-swatch" style="background:${item.color}"></span>
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <span>${formatNumber(item.count)} · ${pct}%</span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="workforce-card">
      <h3>Total Employee By Gender</h3>
      <div class="wf-gender">
        <div class="donut-wrap wf-donut">
          <svg viewBox="0 0 240 240" aria-hidden="true">
            <circle cx="120" cy="120" r="90" fill="none" stroke="#edf2f8" stroke-width="28"></circle>
            ${buildDonutSlices(items, total)}
          </svg>
          <div class="donut-center">
            <div>
              <strong>${formatNumber(total)}</strong>
              <span>พนักงาน</span>
            </div>
          </div>
        </div>
        <div class="wf-gender-legend">${legend}</div>
      </div>
    </div>
  `;
}

function renderGenerationBars(generation) {
  const items = generation.items || [];
  const max = Math.max(...items.map((item) => item.count), 1);
  const axisMax = Math.ceil(max / 50) * 50 || 50;
  const ticks = [];
  for (let t = 0; t <= axisMax; t += 50) ticks.push(t);

  const rows = items
    .map((item) => {
      const widthPct = (item.count / axisMax) * 100;
      return `
        <div class="wf-gen-row">
          <div class="wf-gen-label">${escapeHtml(item.label)}</div>
          <div class="wf-gen-track">
            <div class="wf-gen-bar" style="width:${widthPct}%"></div>
            <span class="wf-gen-value">${formatNumber(item.count)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="workforce-card">
      <h3>Total Employee By Generation</h3>
      <div class="wf-gen">
        ${rows}
        <div class="wf-gen-axis">
          <div class="wf-gen-label" aria-hidden="true"></div>
          <div class="wf-gen-axis-track">
            ${ticks
              .map(
                (tick) => `
                  <span class="emc-hbar-tick" style="left:${(tick / axisMax) * 100}%">
                    <span class="emc-hbar-tick-line"></span>
                    <span class="emc-hbar-tick-label">${formatNumber(tick)}</span>
                  </span>
                `,
              )
              .join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function worstAspect(row, length) {
  if (!row.length) return Infinity;
  const sum = row.reduce((s, item) => s + item.area, 0);
  let max = 0;
  let min = Infinity;
  for (const item of row) {
    max = Math.max(max, item.area);
    min = Math.min(min, item.area);
  }
  return Math.max((length * length * max) / (sum * sum), (sum * sum) / (length * length * min));
}

/** Squarified treemap — คืนพิกัดเปอร์เซ็นต์ (x,y,w,h) */
function layoutSquarifiedTreemap(items, width = 100, height = 100) {
  const total = items.reduce((s, item) => s + item.count, 0);
  if (!total || !items.length) return [];

  const nodes = items.map((item, index) => ({
    ...item,
    area: (item.count / total) * width * height,
    color: BU_TREEMAP_COLORS[index % BU_TREEMAP_COLORS.length],
  }));
  const result = [];

  function layoutRow(row, x, y, w, h, horizontal) {
    const sum = row.reduce((s, item) => s + item.area, 0);
    if (horizontal) {
      const rowH = sum / w;
      let cx = x;
      for (const item of row) {
        const iw = item.area / rowH;
        result.push({ ...item, x: cx, y, w: iw, h: rowH });
        cx += iw;
      }
      return { x, y: y + rowH, w, h: h - rowH };
    }
    const rowW = sum / h;
    let cy = y;
    for (const item of row) {
      const ih = item.area / rowW;
      result.push({ ...item, x, y: cy, w: rowW, h: ih });
      cy += ih;
    }
    return { x: x + rowW, y, w: w - rowW, h };
  }

  function squarify(remaining, x, y, w, h) {
    if (!remaining.length || w <= 0 || h <= 0) return;
    const horizontal = w >= h;
    const side = horizontal ? w : h;
    let row = [];
    let rest = [...remaining];

    while (rest.length) {
      const next = rest[0];
      const candidate = [...row, next];
      if (!row.length || worstAspect(row, side) >= worstAspect(candidate, side)) {
        row = candidate;
        rest = rest.slice(1);
        if (!rest.length) {
          layoutRow(row, x, y, w, h, horizontal);
        }
      } else {
        const box = layoutRow(row, x, y, w, h, horizontal);
        squarify(rest, box.x, box.y, box.w, box.h);
        return;
      }
    }
  }

  squarify(nodes, 0, 0, width, height);
  return result;
}

function renderBuTreemap(buses) {
  const items = [...(buses.items || [])].filter((item) => item.count > 0);
  if (!items.length) {
    return `<div class="workforce-card workforce-card--treemap"><h3>Total Employee By BU</h3><div class="empty-state">ไม่มีข้อมูล BU</div></div>`;
  }

  const total = buses.total || items.reduce((s, i) => s + i.count, 0);
  const gap = 0.4;
  // เรียงตามจำนวนสำหรับ layout ให้ช่องใหญ่ขึ้นก่อน
  const layoutItems = [...items].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, "th"));
  const layout = layoutSquarifiedTreemap(layoutItems, 100, 100).map((tile) => ({
    ...tile,
    color: BU_TREEMAP_COLOR_BY_CODE[tile.code] || tile.color || BU_TREEMAP_OTHER_COLOR,
  }));

  const tiles = layout
    .map((tile) => {
      const left = tile.x + gap / 2;
      const top = tile.y + gap / 2;
      const width = Math.max(0, tile.w - gap);
      const height = Math.max(0, tile.h - gap);
      const fontScale = Math.min(1.35, Math.max(0.85, Math.sqrt(tile.count) / 10));
      return `
        <div
          class="wf-tree-tile"
          style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;background:${tile.color};--tile-scale:${fontScale}"
          title="${escapeHtml(tile.code)}: ${formatNumber(tile.count)}"
        >
          <strong>${escapeHtml(tile.code)}</strong>
          <span>${formatNumber(tile.count)}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="workforce-card workforce-card--treemap">
      <h3>Total Employee By BU <span class="wf-subtotal">(${formatNumber(total)})</span></h3>
      <div class="wf-treemap" role="img" aria-label="Treemap พนักงานแยกตาม BU">${tiles}</div>
      <p class="wf-treemap-note">HRM รวม MHR · MMT รวม 998 · อื่นๆ = ผู้บริหาร + SUVANA</p>
    </div>
  `;
}

function renderWorkforce(payload) {
  if (!els.workforce) return;
  els.workforce.innerHTML = `
    ${renderGenderDonut(payload.gender)}
    ${renderGenerationBars(payload.generation)}
    ${renderBuTreemap(payload.buses)}
  `;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "-";
  return formatNumber(value, 2);
}

function renderTurnover(payload) {
  if (!els.turnover) return;

  const current = payload?.current;
  const previous = payload?.previous;
  if (!current || !previous) {
    els.turnover.innerHTML = `<div class="empty-state">ไม่มีข้อมูล Turnover</div>`;
    return;
  }

  const labels = THAI_MONTHS.map((item) => item.short);
  const currentValues = current.months.map((item) => item.rate);
  const previousValues = previous.months.map((item) => item.rate);
  const allValues = [...currentValues, ...previousValues].filter((value) => Number.isFinite(value));
  const maxValue = allValues.length ? Math.max(...allValues) : 0;
  const axisMax = Math.max(1, Math.ceil((maxValue * 1.15) / 0.5) * 0.5);
  const ticks = Array.from({ length: Math.floor(axisMax / 0.5) + 1 }, (_, index) => index * 0.5);

  const width = 980;
  const height = 420;
  const pad = { top: 54, right: 70, bottom: 56, left: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xStep = plotW / 11;
  const xOf = (index) => pad.left + xStep * index;
  const yOf = (value) => pad.top + plotH - (value / axisMax) * plotH;

  function curvedLinePath(values) {
    const points = values
      .map((value, index) => (
        Number.isFinite(value)
          ? { x: xOf(index), y: yOf(value) }
          : null
      ))
      .filter(Boolean);

    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  }

  function renderSeries(values, color, className) {
    return values
      .map((value, index) => {
        if (!Number.isFinite(value)) return "";
        const x = xOf(index);
        const y = yOf(value);
        return `
          <circle cx="${x}" cy="${y}" r="4.5" class="turnover-dot ${className}" style="fill:${color}"></circle>
          <text x="${x}" y="${Math.max(16, y - 12)}" text-anchor="middle" class="turnover-point-label" style="fill:${color}">${formatPct(value)}</text>
        `;
      })
      .join("");
  }

  const grid = ticks
    .map((tick) => {
      const y = yOf(tick);
      return `
        <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="turnover-grid"></line>
        <text x="${pad.left - 12}" y="${y + 4}" text-anchor="end" class="turnover-axis-label">${formatNumber(tick, 1)}</text>
      `;
    })
    .join("");

  const monthLabels = labels
    .map(
      (label, index) => `
        <text x="${xOf(index)}" y="${height - 18}" text-anchor="middle" class="turnover-month-label">${label}</text>
      `,
    )
    .join("");

  const currentColor = "#b90f2d";
  const previousColor = "#4e83ea";
  const currentPath = curvedLinePath(currentValues);
  const previousPath = curvedLinePath(previousValues);

  els.turnover.innerHTML = `
    <div class="turnover-card">
      <div class="turnover-head">
        <div class="turnover-legend">
          <span><i style="background:${previousColor}"></i>${escapeHtml(String(previous.year + 543))}</span>
          <span><i style="background:${currentColor}"></i>${escapeHtml(String(current.year + 543))}</span>
        </div>
        <div class="turnover-kpis">
          <div class="turnover-kpi turnover-kpi--current">${escapeHtml(String(current.year + 543))} Turnover <strong>${formatPct(current.averageRate)}</strong> / Month</div>
          <div class="turnover-kpi turnover-kpi--previous">${escapeHtml(String(previous.year + 543))} Turnover <strong>${formatPct(previous.averageRate)}</strong> / Month</div>
        </div>
      </div>
      <div class="turnover-chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" class="turnover-chart" role="img" aria-label="Turnover Rate เปรียบเทียบสองปีรายเดือน">
          ${grid}
          <path d="${previousPath}" class="turnover-line turnover-line--previous" style="stroke:${previousColor}"></path>
          <path d="${currentPath}" class="turnover-line turnover-line--current" style="stroke:${currentColor}"></path>
          ${renderSeries(previousValues, previousColor, "turnover-dot--previous")}
          ${renderSeries(currentValues, currentColor, "turnover-dot--current")}
          ${monthLabels}
        </svg>
      </div>
    </div>
  `;
}

function formatCell(value) {
  if (!value || value <= 0) return "-";
  return formatNumber(value, 2);
}

function cellClass(value, row) {
  if (!value || value <= 0) return "";
  const classes = [];
  const isMax =
    row.maxBu &&
    row.maxValue > 0 &&
    Math.abs(value - row.maxValue) < 1e-9;
  if (isMax) classes.push("emc-cell--max");
  else if (value > row.total) classes.push("emc-cell--over");
  return classes.join(" ");
}

function metricValue(rowsById, metricIds, buCode) {
  return metricIds.reduce((sum, id) => {
    const row = rowsById[id];
    if (!row) return sum;
    return sum + (Number(row.values[buCode]) || 0);
  }, 0);
}

function buildChartRows(payload) {
  const rowsById = Object.fromEntries(payload.rows.map((row) => [row.id, row]));
  return payload.buses
    .map((bu) => {
      const segments = CHART_SERIES.map((series) => {
        const value = metricValue(rowsById, series.metrics, bu.code);
        return {
          key: series.key,
          label: series.label,
          color: series.color,
          value,
        };
      }).filter((seg) => seg.value > 0);
      const total = segments.reduce((sum, seg) => sum + seg.value, 0);
      return {
        code: bu.code,
        headcount: bu.headcount,
        segments,
        total,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

function niceMax(value) {
  if (value <= 0) return 10;
  const padded = value * 1.08;
  const step = padded <= 5 ? 1 : padded <= 12 ? 2 : 5;
  return Math.ceil(padded / step) * step;
}

function renderChartLegend() {
  if (!els.chartLegend) return;
  els.chartLegend.innerHTML = CHART_SERIES.map(
    (series) => `
      <span class="emc-chart-legend-item">
        <span class="emc-chart-swatch" style="background:${series.color}"></span>
        ${escapeHtml(series.label)}
      </span>
    `,
  ).join("");
}

function renderChart(payload) {
  if (!els.chart) return;
  const chartRows = buildChartRows(payload);
  renderChartLegend();

  if (!chartRows.length) {
    els.chart.innerHTML = `<div class="empty-state">ไม่มีข้อมูลสำหรับกราฟในช่วงนี้</div>`;
    return;
  }

  const maxTotal = niceMax(Math.max(...chartRows.map((row) => row.total)));
  const ticks = [];
  const step = maxTotal <= 5 ? 1 : maxTotal <= 12 ? 2 : 5;
  for (let t = 0; t <= maxTotal; t += step) ticks.push(t);

  const rowsHtml = chartRows
    .map((row) => {
      const segmentsHtml = row.segments
        .map((seg) => {
          const widthPct = (seg.value / maxTotal) * 100;
          const showLabel = widthPct >= 4.5 || seg.value >= 0.4;
          const light = seg.key === "sick";
          return `
            <div
              class="emc-hbar-seg${light ? " emc-hbar-seg--light" : ""}"
              style="width:${widthPct}%;background:${seg.color}"
              title="${escapeHtml(seg.label)}: ${formatNumber(seg.value, 2)}"
            >
              ${
                showLabel
                  ? `<span class="emc-hbar-seg-label">${formatNumber(seg.value, 2)}</span>`
                  : ""
              }
            </div>
          `;
        })
        .join("");

      return `
        <div class="emc-hbar-row">
          <div class="emc-hbar-label" title="headcount ${formatNumber(row.headcount)}">
            ${escapeHtml(row.code)}
          </div>
          <div class="emc-hbar-track">
            <div class="emc-hbar-stack">${segmentsHtml}</div>
            <span class="emc-hbar-total">${formatNumber(row.total, 2)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  els.chart.innerHTML = `
    <div class="emc-hbar">
      ${rowsHtml}
      <div class="emc-hbar-axis">
        <div class="emc-hbar-label" aria-hidden="true"></div>
        <div class="emc-hbar-axis-track">
          ${ticks
            .map(
              (tick) => `
                <span class="emc-hbar-tick" style="left:${(tick / maxTotal) * 100}%">
                  <span class="emc-hbar-tick-line"></span>
                  <span class="emc-hbar-tick-label">${formatNumber(tick)}</span>
                </span>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderTable(payload) {
  const { buses, totalHeadcount, rows } = payload;
  if (!buses.length) {
    els.body.innerHTML = `<div class="empty-state">ไม่พบข้อมูล headcount จาก ZHR_EMPLOYEE</div>`;
    return;
  }

  const head = `
    <tr>
      <th class="emc-col-stat">สถิติ</th>
      <th class="emc-col-unit">หน่วย</th>
      ${buses
        .map(
          (bu) =>
            `<th class="emc-col-bu">${escapeHtml(bu.code)}<span class="emc-hc">(${formatNumber(bu.headcount)})</span></th>`,
        )
        .join("")}
      <th class="emc-col-total">Total<span class="emc-hc">(${formatNumber(totalHeadcount)})</span></th>
    </tr>
  `;

  const body = rows
    .map((row) => {
      const cells = buses
        .map((bu) => {
          const value = row.values[bu.code] || 0;
          const cls = cellClass(value, row);
          return `<td class="emc-num ${cls}">${formatCell(value)}</td>`;
        })
        .join("");
      return `
        <tr>
          <td class="emc-stat">${escapeHtml(row.label)}</td>
          <td class="emc-unit">${escapeHtml(row.unit)}</td>
          ${cells}
          <td class="emc-num emc-total">${formatCell(row.total)}</td>
        </tr>
      `;
    })
    .join("");

  els.body.innerHTML = `
    <div class="table-wrap emc-scroll">
      <table class="emc-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

async function refresh() {
  const filters = {
    month: Number(els.month.value),
    year: Number(els.year.value),
  };
  writeUrl(filters);

  const monthLabel = THAI_MONTHS.find((m) => m.value === filters.month)?.label || filters.month;
  els.rangeLabel.textContent = `${monthLabel} ${filters.year}`;
  els.loading.hidden = false;
  els.body.innerHTML = "";
  if (els.chart) els.chart.innerHTML = "";

  try {
    const ok = await checkApiHealth();
    els.status.textContent = ok ? "เชื่อมต่อระบบแล้ว" : "เชื่อมต่อไม่ได้ — ลองใหม่";
    els.status.classList.toggle("is-ok", ok);
    els.status.classList.toggle("is-bad", !ok);

    const cacheKey = workforceKey(filters);
    const calendar = getCalendarPeriod();
    const payloadPromise = fetchEmc(filters);
    const workforcePromise =
      workforceCache && workforceCacheKey === cacheKey
        ? Promise.resolve(workforceCache)
        : fetchWorkforce(filters);
    const turnoverPromise = turnoverCache
      ? Promise.resolve(turnoverCache)
      : fetchTurnover(calendar.year);
    const laborPromise = fetchLaborPerTon(filters);
    const [payload, workforcePayload, turnoverPayload, laborPayload] = await Promise.all([
      payloadPromise,
      workforcePromise,
      turnoverPromise,
      laborPromise,
    ]);
    workforceCache = workforcePayload;
    workforceCacheKey = cacheKey;
    if (!turnoverCache) turnoverCache = turnoverPayload;
    renderWorkforce(workforceCache);
    renderTurnover(turnoverCache);
    renderLaborPerTon(laborPayload);
    renderChart(payload);
    renderTable(payload);
  } catch (error) {
    els.body.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (els.chart) {
      els.chart.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    if (els.workforce && !workforceCache) {
      els.workforce.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    if (els.turnover && !turnoverCache) {
      els.turnover.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    if (els.laborPerTon) {
      els.laborPerTon.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    els.status.textContent = "โหลดข้อมูลไม่สำเร็จ";
    els.status.classList.add("is-bad");
  } finally {
    els.loading.hidden = true;
  }
}

function init() {
  const filters = parseFilters();
  fillSelectors(filters);
  els.month.addEventListener("change", refresh);
  els.year.addEventListener("change", refresh);
  refresh();
}

init();
