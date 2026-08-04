# OT Weekly Over 36 Chart Filter Design

## Status
Approved for implementation.

## Goal
Improve the `พนักงาน OT เกิน 36 ชม./สัปดาห์` section so the weekly chart shows richer weekly metrics and can filter only the weekly detail table below it.

## Scope
- Page: `services/time-attendance/report-ot.html`
- Frontend: `services/time-attendance/report-ot.js`, `services/time-attendance/styles.css`
- API: `GET /api/overtime/weekly-over-36`

## User-approved behavior
1. The weekly chart remains scoped to the existing weekly-over-36 section only.
2. Clicking a week in the chart filters only the detail list/table below that chart.
3. Other OT widgets on the page must not change when a week is selected.

## Data contract changes
Extend `weeks[]` from `GET /api/overtime/weekly-over-36` with these fields:

- `employeesOver36`: number of employees whose OT total for that week is greater than 36 hours
- `maxHours`: maximum `totalHours` among employees over 36 in that week
- `avgHours`: average `totalHours` among employees over 36 in that week
- `weekLabel`: formatted display label in `DD-DD/MM/YYYY` form, for example `05-11/01/2026`

Existing `rows[]` stays as the per-employee weekly detail source.

## Calculation rules
- Week remains Monday-Sunday.
- Threshold remains `SUM(ot_hours) > 36`.
- `maxHours` is the highest `totalHours` found in the grouped rows for the same `weekKey`.
- `avgHours` is `SUM(totalHours) / employeesOver36` for the same `weekKey`.
- `weekLabel` is formatted from `weekStart` and `weekEnd` as:
  - same month/year: `05-11/01/2026`
  - if month or year differs, still show both day parts explicitly, for example `29/12/2025-04/01/2026`

## Frontend behavior
### Weekly chart
- Keep the main value above each bar as `employeesOver36`.
- Add secondary metrics per week for:
  - `Max OT` using `maxHours`
  - `Avg OT` using `avgHours`
- Make each weekly bar selectable.
- Selected state is toggle-based:
  - click unselected week -> apply filter
  - click selected week again -> clear filter
- Add a clear-selection control if a week is selected.

### Weekly detail table
- Default state: show all rows from all weeks.
- Selected week state: show only `rows` whose `weekKey` matches the clicked week.
- Show a visible filter hint/chip above the table using the selected week label.
- Pagination still applies after filtering.

### Week period display
- Replace single-date week labels like `05/01/2026`.
- Use the weekly period string everywhere in this section where the week is shown:
  - chart label
  - table week column
  - filter chip / summary text

## UX constraints
- Do not affect OT overview KPI cards, branch/department summaries, or detailed OT person cards.
- Keep the current visual language of the OT page.
- Selected week should be obvious via border/background/active state.
- Empty state under a selected week should still clearly say there are no rows for that filtered week if applicable.

## Error handling
- If `weeks[]` is empty, keep the current empty-state behavior.
- If `avgHours` or `maxHours` cannot be computed, return `0` from the API and render as `0`.

## Testing requirements
- Add/update route tests for weekly aggregation so they verify:
  - week grouping still uses Monday-Sunday
  - `employeesOver36` count is correct
  - `maxHours` is correct
  - `avgHours` is correct
  - `weekLabel` formatting is correct
- Add/update focused frontend tests if the project already has a suitable pattern; otherwise verify behavior through targeted manual checks.

## Manual verification checklist
- Open OT report and confirm the weekly chart renders:
  - employee count
  - max OT
  - avg OT
- Click one week and confirm only the weekly detail table filters.
- Click the same week again and confirm the filter clears.
- Confirm week text shows `05-11/01/2026` style periods.
- Confirm pagination still works after filtering.
