import { withBasePath } from "./shared/base-path.js";
import { checkApiHealth } from "./shared/api.js";
import { escapeHtml, formatNumber } from "./shared/format.js";

const THAI_MONTHS = [
  { value: 1, label: "มกราคม" },
  { value: 2, label: "กุมภาพันธ์" },
  { value: 3, label: "มีนาคม" },
  { value: 4, label: "เมษายน" },
  { value: 5, label: "พฤษภาคม" },
  { value: 6, label: "มิถุนายน" },
  { value: 7, label: "กรกฎาคม" },
  { value: 8, label: "สิงหาคม" },
  { value: 9, label: "กันยายน" },
  { value: 10, label: "ตุลาคม" },
  { value: 11, label: "พฤศจิกายน" },
  { value: 12, label: "ธันวาคม" },
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

async function fetchWorkforce() {
  const response = await fetch(withBasePath("/api/emc/workforce"));
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลด Workforce Overview ได้");
  }
  return payload;
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
    els.body.innerHTML = `<div class="empty-state">ไม่พบข้อมูล headcount จาก tbl_hr_org</div>`;
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

    const tasks = [fetchEmc(filters)];
    if (!workforceCache) tasks.push(fetchWorkforce());
    const results = await Promise.all(tasks);
    const payload = results[0];
    if (results[1]) {
      workforceCache = results[1];
      renderWorkforce(workforceCache);
    } else if (workforceCache) {
      renderWorkforce(workforceCache);
    }
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
