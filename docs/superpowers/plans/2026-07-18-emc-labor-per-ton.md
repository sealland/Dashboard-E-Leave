# EMC Labor-per-Ton Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Add YTD line charts for labor cost per ton (branch + location) on the EMC report.

**Architecture:** New `GET /api/emc/labor-per-ton` aggregates `ZHR_PAY_COM`/`ZHR_PAY_DEPT` with `ZHR_PP`; frontend renders two SVG multi-series line charts bound to EMC year/month filters.

**Tech Stack:** Express + mssql, vanilla JS SVG (EMC turnover pattern), existing CSS.

**Spec:** `docs/superpowers/specs/2026-07-18-emc-labor-per-ton-design.md`

## Global Constraints

- Formula: `(SALARY+OT)/PP_TON`; null if ton=0
- YTD Jan→selected month
- Branch map: O→OCP, K|M→ZUBB
- Location Top 8 by YTD ton
- No Chart.js

---

### Task 1: API route

- [ ] Add `GET /emc/labor-per-ton` in `server/routes/emc.js`
- [ ] Verify with curl/local request when DB available

### Task 2: UI panel + fetch + charts

- [ ] Panel in `report-emc.html`
- [ ] Fetch + SVG render in `report-emc.js`
- [ ] Styles `.emc-labor-*` in `styles.css`
- [ ] Optional `fetchEmcLaborPerTon` in `shared/api.js`

### Task 3: Smoke check

- [ ] `node --check` on modified JS
- [ ] Manual: reload EMC, change month, both charts update
