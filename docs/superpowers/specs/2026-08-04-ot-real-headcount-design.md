# OT Overview real headcount

## Problem
OT Overview card **พนักงานทั้งหมด** counted distinct people in OT transaction rows (~people who already did OT), so it nearly matched **พนักงานทำ OT** and inflated avg OT hours/person.

## Fix
- New API `GET /api/overtime/headcount?to=&c=`
- Source: `ZHR_EMPLOYEE` active as of `to` (`pri_start_d` / `PRI_RES_D`)
- Branch/dept: latest `vw_employee_checkin` row on/before `to` (for filter + auth scope)
- UI filters branch/department client-side via `filterHeadcount`
- Denominator for avg OT / branch-dept tables uses this headcount

## Cards
| Card | Meaning |
|------|---------|
| พนักงานทั้งหมด | Employed headcount (master) |
| พนักงานทำ OT | Distinct people with OT hours &gt; 0 in range |
| เฉลี่ยชม./คน | Total OT hours ÷ พนักงานทั้งหมด |
