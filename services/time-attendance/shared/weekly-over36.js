/**
 * Format week range for display: 05-11/01/26 (same month) or 29/12/25-04/01/26.
 * @param {string} weekStart ISO date YYYY-MM-DD
 * @param {string} weekEnd ISO date YYYY-MM-DD
 */
export function formatWeekPeriodLabel(weekStart, weekEnd) {
  if (!weekStart || !weekEnd) return "-";
  const [sy, sm, sd] = weekStart.split("-");
  const [ey, em, ed] = weekEnd.split("-");
  const shortStartYear = sy.slice(-2);
  const shortEndYear = ey.slice(-2);
  if (sy === ey && sm === em) {
    return `${sd}-${ed}/${sm}/${shortStartYear}`;
  }
  return `${sd}/${sm}/${shortStartYear}-${ed}/${em}/${shortEndYear}`;
}

/**
 * Build weekly summaries from employee-week rows over 36 hours.
 * @param {Array<{ weekKey: string, weekStart: string, weekEnd: string, totalHours: number }>} rows
 */
export function buildWeeklyOver36Summaries(rows) {
  const weekMap = new Map();

  for (const row of rows) {
    if (!weekMap.has(row.weekKey)) {
      weekMap.set(row.weekKey, {
        weekKey: row.weekKey,
        weekStart: row.weekStart,
        weekEnd: row.weekEnd,
        employeesOver36: 0,
        totalHours: 0,
        maxHours: 0,
      });
    }
    const week = weekMap.get(row.weekKey);
    week.employeesOver36 += 1;
    week.totalHours += row.totalHours;
    week.maxHours = Math.max(week.maxHours, row.totalHours);
  }

  return [...weekMap.values()]
    .map((week) => ({
      weekKey: week.weekKey,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      employeesOver36: week.employeesOver36,
      maxHours: week.maxHours,
      avgHours: week.employeesOver36 > 0 ? week.totalHours / week.employeesOver36 : 0,
      weekLabel: formatWeekPeriodLabel(week.weekStart, week.weekEnd),
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
