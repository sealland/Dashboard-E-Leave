import { formatShiftHours } from "./format.js";

const DC_CODE = "DC";
const LUNCH_BREAK_MINUTES = 60;

export function parseTimeToMinutes(timeText) {
  if (!timeText) return null;
  const match = String(timeText).trim().match(/(\d{1,2})[.:](\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseShiftTimes(sfName) {
  const hours = formatShiftHours(sfName);
  if (!hours || hours === "-") return null;
  const [startText, endText] = hours.split("-");
  const startMin = parseTimeToMinutes(startText);
  const endMin = parseTimeToMinutes(endText);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  return { startMin, endMin, startText, endText };
}

export function getScanTimes(row) {
  const info = String(row.TMT_STAMPINFO ?? "").trim();
  if (info) {
    const times = info.split(/\s+/).filter((token) => /^\d{1,2}:\d{2}$/.test(token));
    if (times.length) return times;
  }

  const stampIn = String(row.TMT_STAMP_IN ?? "");
  const match = stampIn.match(/(\d{1,2}):(\d{2})/);
  if (match) return [`${match[1].padStart(2, "0")}:${match[2]}`];
  return [];
}

function getDcAfternoonReturnMin(shift) {
  const workMinutes = shift.endMin - shift.startMin - LUNCH_BREAK_MINUTES;
  const morningMinutes = workMinutes / 2;
  return shift.startMin + morningMinutes + LUNCH_BREAK_MINUTES;
}

export function computeRealLateMinutes(row) {
  const shift = parseShiftTimes(row.SF_NAME);
  if (!shift) return null;

  const scans = getScanTimes(row);
  if (!scans.length) return null;

  const scanMinutes = scans.map(parseTimeToMinutes);
  if (scanMinutes.some((value) => value === null)) return null;

  const sfCode = String(row.SF_CODE ?? "")
    .trim()
    .toUpperCase();

  if (sfCode === DC_CODE) {
    if (scanMinutes.length < 3) return null;
    const morningLate = Math.max(0, scanMinutes[0] - shift.startMin);
    const afternoonReturn = getDcAfternoonReturnMin(shift);
    const afternoonLate = Math.max(0, scanMinutes[2] - afternoonReturn);
    return {
      total: morningLate + afternoonLate,
      morningLate,
      afternoonLate,
      afternoonReturnMin: afternoonReturn,
      isDc: true,
      scans,
      shift,
    };
  }

  const morningLate = Math.max(0, scanMinutes[0] - shift.startMin);
  return {
    total: morningLate,
    morningLate,
    afternoonLate: 0,
    afternoonReturnMin: null,
    isDc: false,
    scans,
    shift,
  };
}

export function formatLateMinutes(minutes) {
  if (minutes === null || minutes === undefined || minutes <= 0) return "-";
  return `${minutes} นาที`;
}

export function formatLateBreakdown(detail) {
  if (!detail) return "-";
  if (!detail.isDc) {
    return detail.total > 0 ? `เช้า ${detail.total} นาที` : "-";
  }
  const parts = [];
  if (detail.morningLate > 0) parts.push(`เช้า ${detail.morningLate} นาที`);
  if (detail.afternoonLate > 0) parts.push(`บ่าย ${detail.afternoonLate} นาที`);
  if (!parts.length) return "-";
  return parts.join(", ");
}

export function enrichDailyLateReal(dailyRows, rawRows) {
  const rawByKey = new Map();
  rawRows.forEach((row) => {
    const key = `${row.EMP_KEY}__${row.TMR_DATE}`;
    if (!rawByKey.has(key)) rawByKey.set(key, row);
  });

  dailyRows.forEach((daily) => {
    daily.lateMinutes = 0;
    daily.lateDetail = null;
    if (daily.lateTimes <= 0) return;

    const raw = rawByKey.get(`${daily.empKey}__${daily.date}`);
    if (!raw) return;

    const detail = computeRealLateMinutes(raw);
    if (!detail) return;

    daily.lateMinutes = detail.total;
    daily.lateDetail = detail;
    daily.lateHours = detail.total / 60;
  });
}
