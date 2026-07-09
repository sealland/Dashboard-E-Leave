export function parseDateString(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (text.includes("T")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const parts = text.split(/[/-]/).map(Number);
  if (parts.length >= 3) {
    const [day, month, year] = parts[0] > 999 ? [parts[2], parts[1], parts[0]] : parts;
    if (day && month && year) return new Date(year, month - 1, day);
  }
  return null;
}

export function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function includesToken(source, token) {
  return (source || "").includes(token);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDisplayDate(isoDate) {
  if (!isoDate) return "-";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function formatScanDateTime(value) {
  if (!value) return "-";
  const text = String(value).trim();
  if (!text) return "-";

  // DB ส่ง ISO แบบ Z แต่ตัวเลขเป็นเวลาไทยอยู่แล้ว — อ่านจาก string ตรงๆ ไม่แปลง timezone
  const isoMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (isoMatch) {
    const [, year, month, day, hours, minutes] = isoMatch;
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  const dmyTime = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (dmyTime) {
    const [, d, m, y, h, min] = dmyTime;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y} ${h.padStart(2, "0")}:${min}`;
  }

  return text;
}

export function formatShiftHours(shiftName) {
  if (!shiftName) return "-";
  const text = String(shiftName).trim();
  const match = text.match(/(\d{1,2}[.:]\d{2})\s*-\s*(\d{1,2}[.:]\d{2})/);
  if (match) {
    const start = match[1].replace(":", ".");
    const end = match[2].replace(":", ".");
    return `${start}-${end}`;
  }
  return text;
}
