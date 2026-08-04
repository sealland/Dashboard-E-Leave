# OT Over 36 Hours Weekly Report Design

## Goal
Add a new report block to `services/time-attendance/report-ot.html` immediately after the "ประสิทธิภาพการผลิต" section to show employees whose weekly overtime exceeds 36 hours within the currently selected date range.

## Confirmed Requirements
- Use the same date range selected on the OT dashboard.
- Define a week as Monday through Sunday.
- Aggregate OT by employee and week using `TMR_QTY_T`.
- Show only employee-week rows where total OT is greater than 36 hours.
- Keep the amount of visible data small, but allow pagination.
- Place the new block below the productivity section.

## Recommended UX
Use a mixed layout:
- A compact summary chart at the top showing the count of employees over 36 hours for each week in the selected range.
- A paginated detail list below showing the actual employee-week rows.

This gives a quick weekly overview while still letting users inspect who exceeded the limit.

## Data Shape
Each result row should represent one employee in one week:
- `weekStart`
- `weekEnd`
- `weekKey`
- `prsNo`
- `empKey`
- `employeeName`
- `departmentCode`
- `departmentName`
- `branchCode`
- `branchName`
- `totalHours`
- `dayCount`

The API should also return weekly summary buckets:
- `weekKey`
- `weekStart`
- `weekEnd`
- `employeesOver36`

## Backend Design
Add a new overtime API endpoint, for example:
- `GET /api/overtime/weekly-over-36`

### Request
- `from`
- `to`
- auth parameter `c`

### Behavior
- Reuse existing OT report authorization with `REPORT_TIME_ATTENDANCE`.
- Filter source rows from `dbo.vw_employee_checkin` to the selected date range.
- Apply the same authorization scope used by the OT report.
- Compute week boundaries using Monday as the first day of the week.
- Group by employee and week.
- Keep only rows with `SUM(TMR_QTY_T) > 36`.
- Return both:
  - weekly summary counts for charting
  - paginated-ready detail rows for the client

### Query Notes
- The first version can return all matched rows for the chosen date range and let the client paginate.
- If volume becomes large later, the endpoint can be extended to server-side pagination without changing the UI concept.

## Frontend Design
Add a new zone after the productivity block in `services/time-attendance/report-ot.html`:
- section title describing OT over 36 hours per week
- summary chart container
- detail list container

In `services/time-attendance/report-ot.js`:
- add state for the new payload
- add state for a second paginator dedicated to this block
- fetch this data separately from the main OT summary so the page remains responsive
- render:
  - a simple weekly bar chart for `employeesOver36`
  - a paginated list or compact table for the detailed rows

## Pagination
Reuse the existing page-size and next/previous interaction pattern already used in the OT detail section:
- default 10 rows per page
- page-size options such as 10, 20, 50
- separate pagination state from the existing person-detail paginator

## Empty and Error States
- No matches: show a friendly empty state such as no employees exceeded 36 hours in the selected range.
- API error: show an inline error block without breaking the rest of the OT dashboard.
- Loading: show a lightweight loading placeholder in the new section only.

## Performance Considerations
- Do not block the main OT dashboard render on this new section.
- Load it independently, similar to the productivity block pattern.
- Prefer server-side aggregation by week and employee to avoid sending large raw datasets to the browser.

## Authorization
- Use the same `time-attendance` report authorization path as the OT dashboard.
- Respect current department and branch scoping.
- No special ALL-only behavior is required; this block should work for both limited and full-scope authorized users.

## Testing
- Verify a range with no over-36 employees.
- Verify a range with multiple weeks and multiple matching employees.
- Verify Monday-Sunday week grouping at month boundaries.
- Verify pagination controls.
- Verify limited-scope users only see employees inside their authorization scope.
