# EMC — ค่าแรงต่อตัน (บาท/ตัน)

**Date:** 2026-07-18  
**Status:** Approved for implementation (pending user review of this spec)  
**Surface:** Time Attendance → รายงาน EMC (`report-emc.html`)

## Goal

เพิ่มกราฟในรายงาน EMC แสดง **ค่าแรงต่อตันการผลิต (บาท/ตัน)** แยก 2 ระดับ:

1. **สาขา** — จาก `ZHR_PAY_COM` + ตันจาก `ZHR_PP` (ม้วนตามสาขา)
2. **Location** — จาก `ZHR_PAY_DEPT` + `ZHR_PP` (ราย `DEPT_CODE`)

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Formula | `(SALARY + OT) / PP_TON` |
| Charts | 2 separate line charts (branch + location) |
| Period | YTD: Jan → selected EMC month/year |
| Branch map | First letter of `DEPT_CODE`: `O` → `OCP`; `K` or `M` → `ZUBB` |
| Visual | Monthly **combo**: bars = labor baht (SALARY+OT), line = baht/ton (dual axis) |
| Approach | Single API + hand-rolled SVG combo (OT PP pattern) |

## Formula detail

```
laborPerTon(month, unit) =
  (sum SALARY + sum OT) / sum PP_TON
```

- If `PP_TON` sum for that month/unit is `0` or missing → `laborPerTon = null` (gap in line / skip point).
- Pay and ton are both summed for the same year-month and unit before dividing (not average of daily ratios).

## Data sources

### Branch chart

| Role | Table | Grain |
|------|--------|--------|
| Labor | `ZHR_PAY_COM` | `PAY_YEAR`, `PAY_MONTH`, `DEPT_CODE` ∈ {OCP, ZUBB, …} |
| Ton | `ZHR_PP` | Map each `DEPT_CODE` → branch, then `SUM(PP_TON)` |

**Branch mapping from PP (and any PP-like dept code):**

```
firstChar = upper(left(DEPT_CODE, 1))
if O → OCP
if K or M → ZUBB
else → ignore for branch rollup (or bucket "อื่นๆ" if needed later)
```

Join conceptually: for each `(year, month, branchCode)`:

- pay = row from `ZHR_PAY_COM` where `DEPT_CODE = branchCode`
- ton = sum of `ZHR_PP.PP_TON` for depts mapping to that branch

### Location chart

| Role | Table | Grain |
|------|--------|--------|
| Labor | `ZHR_PAY_DEPT` | `PAY_YEAR`, `PAY_MONTH`, `DEPT_CODE` |
| Ton | `ZHR_PP` | same keys |

Join on `(year, month, DEPT_CODE)`.

## API

`GET /api/emc/labor-per-ton?year={yyyy}&month={1-12}`

### Response (shape)

```json
{
  "meta": {
    "year": 2026,
    "fromMonth": 1,
    "toMonth": 7,
    "formula": "(SALARY+OT)/PP_TON",
    "unit": "THB/ton"
  },
  "months": ["2026-01", "2026-02", "..."],
  "branch": {
    "series": [
      {
        "code": "OCP",
        "name": "OCP",
        "points": [
          { "month": "2026-01", "salary": 0, "ot": 0, "ton": 0, "laborPerTon": null }
        ]
      }
    ]
  },
  "location": {
    "series": [
      {
        "code": "MPD/3",
        "name": "MPD/3",
        "points": []
      }
    ],
    "note": "If >8 locations with data, keep Top 8 by YTD ton; rest omitted from chart (listed in meta.omitted if useful)"
  }
}
```

### Location series limit

- Prefer clarity: show up to **8** location series with highest **YTD labor cost** `(SALARY+OT)`.
- Remaining locations: omit from chart (`meta.locationOmitted`).
- No “อื่นๆ” rollup in v1 unless product asks later.

## UI

- Panel title: **ค่าแรง & ประสิทธิภาพค่าแรง**.
- Two combo charts side-by-side:
  1. Branch (ZUBB / OCP) — grouped bars per month + ratio lines
  2. Location Top 8 by YTD labor — same combo pattern
- Left axis: บาท · Right axis: บาท/ตัน
- Tooltip: month, unit, baht, ton, baht/ton
- Replaces the previous line-only labor-per-ton charts (no duplicate panels).

## Frontend files

- `report-emc.html` — panel markup
- `report-emc.js` — fetch + SVG line render (reuse patterns from turnover chart)
- `styles.css` — `.emc-labor-*` layout
- `shared/api.js` — `fetchEmcLaborPerTon`
- `server/routes/emc.js` — new route handler + SQL

## Non-goals (v1)

- No IIS / port changes.
- No Chart.js dependency.
- No editing of PAY/PP source tables.
- No OT-hours productivity mix-in (that stays on OT report).
- No full 12-month forced range (only YTD to selected month).

## Test plan

1. Pick a year/month with known PAY_COM + PP rows; verify OCP/ZUBB points match manual `(SALARY+OT)/ton`.
2. Verify dept `MPD/3` ton rolls into ZUBB; `OCP` into OCP.
3. Location chart matches PAY_DEPT÷PP for same `DEPT_CODE`.
4. Month with ton=0 shows gap / null, no Infinity.
5. Changing EMC month filter refreshes both charts.
6. Responsive: two charts stack on narrow width.

## Open points (resolved for v1)

- Codes not starting with O/K/M: **excluded** from branch ton rollup.
- Location overflow: **Top 8 by YTD labor cost**.
