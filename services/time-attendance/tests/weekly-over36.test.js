import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyOver36Summaries,
  formatWeekPeriodLabel,
} from "../shared/weekly-over36.js";

test("formatWeekPeriodLabel same month", () => {
  assert.equal(formatWeekPeriodLabel("2026-01-05", "2026-01-11"), "05-11/01/26");
});

test("formatWeekPeriodLabel cross month", () => {
  assert.equal(formatWeekPeriodLabel("2025-12-29", "2026-01-04"), "29/12/25-04/01/26");
});

test("buildWeeklyOver36Summaries aggregates count max and avg", () => {
  const weeks = buildWeeklyOver36Summaries([
    {
      weekKey: "2026-01-05",
      weekStart: "2026-01-05",
      weekEnd: "2026-01-11",
      totalHours: 40,
    },
    {
      weekKey: "2026-01-05",
      weekStart: "2026-01-05",
      weekEnd: "2026-01-11",
      totalHours: 48,
    },
    {
      weekKey: "2026-01-12",
      weekStart: "2026-01-12",
      weekEnd: "2026-01-18",
      totalHours: 37,
    },
  ]);

  assert.equal(weeks.length, 2);

  const first = weeks.find((week) => week.weekKey === "2026-01-05");
  assert.equal(first.employeesOver36, 2);
  assert.equal(first.maxHours, 48);
  assert.equal(first.avgHours, 44);
  assert.equal(first.weekLabel, "05-11/01/26");

  const second = weeks.find((week) => week.weekKey === "2026-01-12");
  assert.equal(second.employeesOver36, 1);
  assert.equal(second.maxHours, 37);
  assert.equal(second.avgHours, 37);
  assert.equal(second.weekLabel, "12-18/01/26");
});
