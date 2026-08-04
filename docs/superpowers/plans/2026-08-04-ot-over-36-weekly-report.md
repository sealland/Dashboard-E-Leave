# OT Over 36 Hours Weekly Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new OT dashboard section that shows employees whose Monday-Sunday weekly OT total exceeds 36 hours within the selected date range, with a weekly summary chart and paginated detail rows.

**Architecture:** Add one new aggregated API endpoint on the overtime router, then render a new independent dashboard block on the OT page that loads separately from the main summary. Reuse existing report authorization and pagination behavior so the new feature stays consistent with current OT report patterns while keeping the main page responsive.

**Tech Stack:** Express, MSSQL, vanilla JavaScript modules, existing OT dashboard HTML/CSS, existing auth helpers, existing formatting helpers

## Global Constraints

- Use the same date range selected on the OT dashboard.
- Define a week as Monday through Sunday.
- Aggregate OT by employee and week using `TMR_QTY_T`.
- Show only employee-week rows where total OT is greater than 36 hours.
- Keep the amount of visible data small, but allow pagination.
- Place the new block below the productivity section.
- Use the existing `time-attendance` report authorization path.
- Do not block the main OT dashboard render on this new section.

---

## File Structure

- Modify `services/time-attendance/server/routes/overtime.js`
  - Add `GET /api/overtime/weekly-over-36`
  - Aggregate `vw_employee_checkin` rows into Monday-Sunday employee-week records
  - Return weekly summary buckets plus detail rows
- Modify `services/time-attendance/shared/api.js`
  - Add a fetch helper for the new endpoint
- Modify `services/time-attendance/report-ot.html`
  - Insert the new dashboard zone after the productivity section
- Modify `services/time-attendance/report-ot.js`
  - Add state, loading, rendering, and pagination for the new weekly OT block
- Modify `services/time-attendance/styles.css`
  - Add presentation styles for the weekly chart, summary, and paginated detail table

## Task 1: Add Weekly OT Over-36 API

**Files:**
- Modify: `services/time-attendance/server/routes/overtime.js`

**Interfaces:**
- Consumes: `requireReportAuth(req, res, REPORT_TIME_ATTENDANCE, { c })`, `buildAuthSql(request, auth, { alias: "c", includeBranch: true })`
- Produces: `GET /api/overtime/weekly-over-36?from=YYYY-MM-DD&to=YYYY-MM-DD&c=PRS_NO` returning:
  - `{ weeks: WeeklyBucket[], rows: WeeklyEmployeeRow[], meta: {...} }`
  - `type WeeklyBucket = { weekKey: string, weekStart: string, weekEnd: string, employeesOver36: number }`
  - `type WeeklyEmployeeRow = { weekKey: string, weekStart: string, weekEnd: string, prsNo: string, empKey: string, employeeName: string, departmentCode: string, departmentName: string, branchCode: string, branchName: string, totalHours: number, dayCount: number }`

- [ ] **Step 1: Write the failing test**

No automated test harness currently exists for this route. Use a one-off verification contract instead by defining expected response shape and week behavior before coding:

```js
// Expected contract for GET /api/overtime/weekly-over-36
// 1. Rejects when from/to missing
// 2. Reuses REPORT_TIME_ATTENDANCE auth
// 3. Aggregates rows by employee + Monday-Sunday week
// 4. Filters to SUM(TMR_QTY_T) > 36
// 5. Returns both weeks[] and rows[]
```

- [ ] **Step 2: Run the route syntax check to establish baseline**

Run: `node --check "services/time-attendance/server/routes/overtime.js"`

Expected: PASS with no output

- [ ] **Step 3: Write minimal implementation**

Add a new route near the existing overtime routes with this structure:

```js
router.get("/overtime/weekly-over-36", async (req, res) => {
  const { from, to, c } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  try {
    const auth = await requireReportAuth(req, res, REPORT_TIME_ATTENDANCE, { c });
    if (!auth) return;

    const pool = await getPool();
    const request = pool.request();
    request.input("from", sql.Date, from);
    request.input("to", sql.Date, to);
    const authSql = buildAuthSql(request, auth, { alias: "c", includeBranch: true });

    const result = await request.query(`
      SET DATEFIRST 1;

      WITH base AS (
        SELECT
          LTRIM(RTRIM(CAST(c.PRS_NO AS NVARCHAR(50)))) AS prs_no,
          LTRIM(RTRIM(CAST(c.EMP_KEY AS NVARCHAR(50)))) AS emp_key,
          LTRIM(RTRIM(CAST(c.EMP_NAME AS NVARCHAR(200)))) AS emp_name,
          LTRIM(RTRIM(CAST(c.EMP_SURNME AS NVARCHAR(200)))) AS emp_surname,
          LTRIM(RTRIM(CAST(c.DEPT_CODE AS NVARCHAR(100)))) AS dept_code,
          LTRIM(RTRIM(CAST(c.DEPT_THAIDESC AS NVARCHAR(200)))) AS dept_name,
          LTRIM(RTRIM(CAST(c.BR_CODE AS NVARCHAR(100)))) AS branch_code,
          LTRIM(RTRIM(CAST(c.BR_THAIDESC AS NVARCHAR(200)))) AS branch_name,
          CAST(c.TMR_DATE AS date) AS work_date,
          CAST(c.TMR_QTY_T AS float) AS ot_hours,
          DATEADD(day, 1 - DATEPART(weekday, c.TMR_DATE), CAST(c.TMR_DATE AS date)) AS week_start,
          DATEADD(day, 7 - DATEPART(weekday, c.TMR_DATE), CAST(c.TMR_DATE AS date)) AS week_end
        FROM dbo.vw_employee_checkin c
        WHERE c.TMR_DATE >= @from
          AND c.TMR_DATE <= @to
          ${authSql}
      ),
      grouped AS (
        SELECT
          week_start,
          week_end,
          prs_no,
          emp_key,
          MAX(emp_name) AS emp_name,
          MAX(emp_surname) AS emp_surname,
          MAX(dept_code) AS dept_code,
          MAX(dept_name) AS dept_name,
          MAX(branch_code) AS branch_code,
          MAX(branch_name) AS branch_name,
          SUM(ot_hours) AS total_hours,
          COUNT(DISTINCT work_date) AS day_count
        FROM base
        GROUP BY week_start, week_end, prs_no, emp_key
        HAVING SUM(ot_hours) > 36
      )
      SELECT
        CONVERT(varchar(10), week_start, 23) AS week_start,
        CONVERT(varchar(10), week_end, 23) AS week_end,
        CONVERT(varchar(10), week_start, 23) AS week_key,
        prs_no,
        emp_key,
        LTRIM(RTRIM(CONCAT(COALESCE(emp_name, ''), ' ', COALESCE(emp_surname, '')))) AS employee_name,
        dept_code,
        dept_name,
        branch_code,
        branch_name,
        total_hours,
        day_count
      FROM grouped
      ORDER BY week_start DESC, total_hours DESC, employee_name ASC;
    `);

    const rows = result.recordset.map((row) => ({
      weekKey: row.week_key,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      prsNo: row.prs_no || "",
      empKey: row.emp_key || "",
      employeeName: row.employee_name || "",
      departmentCode: row.dept_code || "",
      departmentName: row.dept_name || "",
      branchCode: row.branch_code || "",
      branchName: row.branch_name || "",
      totalHours: Number(row.total_hours) || 0,
      dayCount: Number(row.day_count) || 0,
    }));

    const weekMap = new Map();
    for (const row of rows) {
      const key = row.weekKey;
      if (!weekMap.has(key)) {
        weekMap.set(key, {
          weekKey: row.weekKey,
          weekStart: row.weekStart,
          weekEnd: row.weekEnd,
          employeesOver36: 0,
        });
      }
      weekMap.get(key).employeesOver36 += 1;
    }

    res.json({
      weeks: [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      rows,
      meta: { from, to, thresholdHours: 36, weekStartsOn: "monday", auth },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Run syntax check to verify the route passes**

Run: `node --check "services/time-attendance/server/routes/overtime.js"`

Expected: PASS with no output

## Task 2: Add Client Fetch Helper

**Files:**
- Modify: `services/time-attendance/shared/api.js`

**Interfaces:**
- Consumes: `withBasePath()`, `withAuthParams()`
- Produces: `fetchWeeklyOver36({ from, to }) => Promise<{ weeks, rows, meta }>`

- [ ] **Step 1: Write the failing usage contract**

```js
// Expected helper usage
const payload = await fetchWeeklyOver36({ from: "2026-08-01", to: "2026-08-31" });
console.log(payload.weeks, payload.rows, payload.meta.thresholdHours);
```

- [ ] **Step 2: Run syntax check to establish baseline**

Run: `node --check "services/time-attendance/shared/api.js"`

Expected: PASS with no output

- [ ] **Step 3: Write minimal implementation**

Add this helper beside the other overtime fetchers:

```js
export async function fetchWeeklyOver36({ from, to }) {
  if (!from || !to) throw new Error("from and to are required");
  const params = new URLSearchParams({ from, to });
  const { withAuthParams } = await import("./prs-auth.js");
  withAuthParams(params);

  const response = await fetch(
    `${withBasePath("/api/overtime/weekly-over-36")}?${params.toString()}`,
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลดข้อมูล OT เกิน 36 ชม./สัปดาห์ได้");
  }
  return payload;
}
```

- [ ] **Step 4: Run syntax check to verify the helper passes**

Run: `node --check "services/time-attendance/shared/api.js"`

Expected: PASS with no output

## Task 3: Add OT Weekly Over-36 Section Markup

**Files:**
- Modify: `services/time-attendance/report-ot.html`

**Interfaces:**
- Consumes: DOM structure after the productivity section
- Produces:
  - `#weekly-over36-summary`
  - `#weekly-over36-body`

- [ ] **Step 1: Write the DOM contract**

```html
<!-- New section sits after the productivity block -->
<div id="weekly-over36-summary"></div>
<div id="weekly-over36-body"></div>
```

- [ ] **Step 2: Verify current HTML parses cleanly**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

- [ ] **Step 3: Write minimal implementation**

Insert a new zone after the productivity section:

```html
<div class="ot-zone ot-zone--weekly-over36">
  <header class="ot-zone-head">
    <p class="ot-zone-kicker">ควบคุมชั่วโมงทำงาน</p>
    <p class="ot-zone-desc">ใช้ช่วงวันที่เดียวกับด้านบน · รวม OT ต่อพนักงานต่อสัปดาห์ (จันทร์-อาทิตย์)</p>
  </header>

  <section class="panel panel-weekly-over36">
    <div class="panel-head">
      <div>
        <h2>พนักงาน OT เกิน 36 ชม./สัปดาห์</h2>
        <p>กราฟสรุปจำนวนคนต่อสัปดาห์ และรายการพนักงานที่มี OT รวมเกิน 36 ชั่วโมง</p>
      </div>
    </div>
    <div id="weekly-over36-summary" class="weekly-over36-summary">
      <div class="empty-state">กำลังโหลด...</div>
    </div>
    <div id="weekly-over36-body" class="weekly-over36-body">
      <div class="empty-state">กำลังโหลด...</div>
    </div>
  </section>
</div>
```

- [ ] **Step 4: Run a module syntax check after the markup change**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

## Task 4: Render Weekly Summary and Paginated Detail

**Files:**
- Modify: `services/time-attendance/report-ot.js`

**Interfaces:**
- Consumes: `fetchWeeklyOver36({ from, to })`
- Produces:
  - `loadWeeklyOver36()`
  - `renderWeeklyOver36(payload)`
  - `renderWeeklyOver36Chart(weeks)`
  - weekly paginator state independent from `reportPage`

- [ ] **Step 1: Write the failing render contract**

```js
const payload = {
  weeks: [{ weekKey: "2026-08-03", weekStart: "2026-08-03", weekEnd: "2026-08-09", employeesOver36: 2 }],
  rows: [{ weekKey: "2026-08-03", employeeName: "Demo User", totalHours: 40.5, dayCount: 6 }],
  meta: { thresholdHours: 36 }
};
renderWeeklyOver36(payload);
```

- [ ] **Step 2: Run syntax check to establish baseline**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

- [ ] **Step 3: Write minimal implementation**

Add state:

```js
weeklyOver36Payload: null,
weeklyOver36Loading: false,
weeklyOver36Page: 1,
weeklyOver36PageSize: 10,
```

Add DOM refs:

```js
weeklyOver36Summary: document.getElementById("weekly-over36-summary"),
weeklyOver36Body: document.getElementById("weekly-over36-body"),
```

Add loader:

```js
async function loadWeeklyOver36() {
  if (!els.weeklyOver36Summary || !els.weeklyOver36Body) return;
  if (state.weeklyOver36Loading) return;

  state.weeklyOver36Loading = true;
  try {
    const payload = await fetchWeeklyOver36({
      from: state.filters.from,
      to: state.filters.to,
    });
    state.weeklyOver36Payload = payload;
    renderWeeklyOver36(payload);
  } catch (error) {
    const html = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    els.weeklyOver36Summary.innerHTML = html;
    els.weeklyOver36Body.innerHTML = html;
  } finally {
    state.weeklyOver36Loading = false;
  }
}
```

Add chart renderer:

```js
function renderWeeklyOver36Chart(weeks) {
  if (!weeks.length) {
    return '<div class="empty-state">ไม่มีพนักงานที่ OT เกิน 36 ชม. ในช่วงที่เลือก</div>';
  }

  const maxCount = Math.max(...weeks.map((week) => week.employeesOver36), 1);
  return `
    <div class="weekly-over36-bars">
      ${weeks
        .map((week) => `
          <div class="weekly-over36-bar-card">
            <div class="weekly-over36-bar-value">${formatNumber(week.employeesOver36)}</div>
            <div class="weekly-over36-bar-track">
              <div class="weekly-over36-bar-fill" style="height:${(week.employeesOver36 / maxCount) * 100}%"></div>
            </div>
            <div class="weekly-over36-bar-label">${escapeHtml(formatLooseDate(week.weekStart))}</div>
          </div>
        `)
        .join("")}
    </div>
  `;
}
```

Add detail renderer:

```js
function renderWeeklyOver36(payload) {
  const weeks = payload?.weeks || [];
  const rows = payload?.rows || [];

  els.weeklyOver36Summary.innerHTML = renderWeeklyOver36Chart(weeks);

  if (!rows.length) {
    els.weeklyOver36Body.innerHTML =
      '<div class="empty-state">ไม่มีพนักงานที่ OT เกิน 36 ชม. ในช่วงที่เลือก</div>';
    return;
  }

  const pageSizeOptions = [10, 20, 50];
  const totalPages = Math.max(1, Math.ceil(rows.length / state.weeklyOver36PageSize));
  state.weeklyOver36Page = Math.min(Math.max(1, state.weeklyOver36Page), totalPages);
  const start = (state.weeklyOver36Page - 1) * state.weeklyOver36PageSize;
  const pageRows = rows.slice(start, start + state.weeklyOver36PageSize);

  els.weeklyOver36Body.innerHTML = `
    <div class="report-toolbar">
      <div class="report-toolbar-meta">
        <strong>${formatNumber(rows.length)} รายการ</strong>
        <span>แสดง ${formatNumber(start + 1)}-${formatNumber(Math.min(start + state.weeklyOver36PageSize, rows.length))}</span>
      </div>
      <div class="report-pagination">
        <label class="report-page-size">
          <span>หน้าละ</span>
          <select data-weekly-over36-page-size>
            ${pageSizeOptions.map((size) => `<option value="${size}" ${size === state.weeklyOver36PageSize ? "selected" : ""}>${size}</option>`).join("")}
          </select>
          <span>รายการ</span>
        </label>
        <div class="report-pagination-controls">
          <button type="button" class="report-page-btn" data-weekly-over36-page-action="prev" ${state.weeklyOver36Page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
          <span class="report-page-indicator">หน้า ${formatNumber(state.weeklyOver36Page)} / ${formatNumber(totalPages)}</span>
          <button type="button" class="report-page-btn" data-weekly-over36-page-action="next" ${state.weeklyOver36Page >= totalPages ? "disabled" : ""}>ถัดไป</button>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>สัปดาห์</th>
            <th>รหัส</th>
            <th>ชื่อพนักงาน</th>
            <th>แผนก</th>
            <th>สาขา</th>
            <th>วันทำ OT</th>
            <th>รวม OT</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map((row) => `
            <tr>
              <td>${escapeHtml(`${formatLooseDate(row.weekStart)} ถึง ${formatLooseDate(row.weekEnd)}`)}</td>
              <td>${escapeHtml(row.prsNo || row.empKey)}</td>
              <td><strong>${escapeHtml(row.employeeName)}</strong></td>
              <td>${escapeHtml(row.departmentName || row.departmentCode || "-")}</td>
              <td>${escapeHtml(row.branchName || row.branchCode || "-")}</td>
              <td>${formatNumber(row.dayCount)}</td>
              <td><strong>${formatNumber(row.totalHours, 2)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
```

Trigger loading from the OT page refresh path:

```js
state.weeklyOver36Payload = null;
state.weeklyOver36Page = 1;
loadWeeklyOver36();
```

Bind paginator events after rendering:

```js
const pageSizeSelect = els.weeklyOver36Body.querySelector("[data-weekly-over36-page-size]");
if (pageSizeSelect) {
  pageSizeSelect.addEventListener("change", (event) => {
    state.weeklyOver36PageSize = Number(event.target.value) || 10;
    state.weeklyOver36Page = 1;
    renderWeeklyOver36(payload);
  });
}

els.weeklyOver36Body.querySelectorAll("[data-weekly-over36-page-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.weeklyOver36PageAction;
    if (action === "prev" && state.weeklyOver36Page > 1) state.weeklyOver36Page -= 1;
    if (action === "next" && state.weeklyOver36Page < totalPages) state.weeklyOver36Page += 1;
    renderWeeklyOver36(payload);
  });
});
```

- [ ] **Step 4: Run syntax check to verify the page script passes**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

## Task 5: Add Styles for the New Block

**Files:**
- Modify: `services/time-attendance/styles.css`

**Interfaces:**
- Consumes: `.weekly-over36-summary`, `.weekly-over36-body`, `.weekly-over36-bars`
- Produces: readable chart and table presentation aligned with existing OT dashboard style

- [ ] **Step 1: Write the style contract**

```css
.weekly-over36-bars {}
.weekly-over36-bar-card {}
.weekly-over36-bar-fill {}
```

- [ ] **Step 2: Check the stylesheet for syntax baseline**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

- [ ] **Step 3: Write minimal implementation**

Add styles near the OT report styles:

```css
.weekly-over36-summary,
.weekly-over36-body {
  margin-top: 16px;
}

.weekly-over36-bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
  align-items: end;
}

.weekly-over36-bar-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  min-height: 180px;
  display: grid;
  gap: 10px;
}

.weekly-over36-bar-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #991b1b;
}

.weekly-over36-bar-track {
  height: 90px;
  display: flex;
  align-items: end;
}

.weekly-over36-bar-fill {
  width: 100%;
  min-height: 8px;
  border-radius: 10px 10px 4px 4px;
  background: linear-gradient(180deg, #f87171 0%, #dc2626 100%);
}

.weekly-over36-bar-label {
  font-size: 0.82rem;
  color: #475569;
}
```

- [ ] **Step 4: Run syntax verification after CSS changes**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

## Task 6: Verify the Feature End-to-End

**Files:**
- Modify: none

**Interfaces:**
- Consumes: new route, fetch helper, HTML section, page renderer, CSS
- Produces: verified weekly OT over-36 feature

- [ ] **Step 1: Verify backend files parse**

Run: `node --check "services/time-attendance/server/routes/overtime.js" && node --check "services/time-attendance/shared/api.js"`

Expected: PASS with no output

- [ ] **Step 2: Verify frontend files parse**

Run: `node --check "services/time-attendance/report-ot.js"`

Expected: PASS with no output

- [ ] **Step 3: Verify changed files in git diff**

Run: `git diff -- services/time-attendance/server/routes/overtime.js services/time-attendance/shared/api.js services/time-attendance/report-ot.html services/time-attendance/report-ot.js services/time-attendance/styles.css`

Expected: diff shows the new route, fetch helper, new section markup, JS renderers, and styles only

- [ ] **Step 4: Manual validation checklist**

Run through these checks in the browser:

```text
1. Open report-ot page with a valid ?c= value
2. Choose a month range with known OT activity
3. Confirm the new block appears below productivity
4. Confirm the summary chart shows weekly counts
5. Confirm only employee-weeks above 36 hours appear
6. Confirm page size and prev/next controls work
7. Confirm changing date range reloads this section
8. Confirm empty state displays when no rows exceed 36 hours
9. Confirm scoped users only see rows inside their allowed branch/department
```

## Self-Review

- Spec coverage: all approved requirements map to Tasks 1 through 6.
- Placeholder scan: no TODO/TBD markers remain.
- Type consistency: the plan uses one payload shape consistently: `weeks[]`, `rows[]`, `meta`.
