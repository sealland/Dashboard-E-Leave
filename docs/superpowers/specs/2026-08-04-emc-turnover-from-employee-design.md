# EMC Turnover Rate from ZHR_EMPLOYEE

## Status: active (user choice)

Turnover Rate is calculated **only** from `dbo.ZHR_EMPLOYEE`.

### Formula
- **Headcount (emp_all)** at month-end: `pri_start_d <= month_end` and `(PRI_RES_D IS NULL OR PRI_RES_D > month_end)`, non-empty `emp_code`
- **Leavers (turnover)**: count rows whose `PRI_RES_D` falls in that calendar month
- **Rate**: `(turnover / emp_all) * 100`; future months in the current year → `null`
- Scope: full company (no `EXCLUDED_BUS`); not tied to EMC month/year filters (uses machine calendar year vs previous year)

### Known data limitation
Prior calendar years may show near-zero leavers if historical `PRI_RES_D` rows were purged from the master. That is a data issue, not a chart bug.
