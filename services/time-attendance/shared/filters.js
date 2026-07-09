import { formatIsoDate } from "./format.js";

export function getDefaultRange() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return {
    from: `${today.getFullYear()}-${month}-01`,
    to: `${today.getFullYear()}-${month}-${day}`,
  };
}

export function getDateRange(filters) {
  if (filters.from && filters.to) {
    return { from: filters.from, to: filters.to };
  }
  return getDefaultRange();
}

export function getPreviousDateRange(filters) {
  const { from, to } = getDateRange(filters);
  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  const days = Math.max(1, Math.round((toDate - fromDate) / 86400000) + 1);

  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);

  return { from: formatIsoDate(prevFrom), to: formatIsoDate(prevTo) };
}

export function passesFilters(row, filters) {
  if (row.isHoliday) return false;
  if (filters.branch !== "all" && row.branchCode !== filters.branch) return false;
  if (filters.department !== "all" && row.departmentCode !== filters.department) return false;

  const { from, to } = getDateRange(filters);
  if (from && row.isoDate < from) return false;
  if (to && row.isoDate > to) return false;
  return true;
}

export function parseUrlFilters(searchParams, defaults = {}) {
  const fallback = getDefaultRange();
  return {
    from: searchParams.get("from") || defaults.from || fallback.from,
    to: searchParams.get("to") || defaults.to || fallback.to,
    branch: searchParams.get("branch") || defaults.branch || "all",
    department: searchParams.get("department") || defaults.department || "all",
  };
}

export function getExpandedFetchRange(filters) {
  const base = getDateRange(filters);
  const previous = getPreviousDateRange(filters);
  return { from: previous.from, to: base.to };
}

export function buildReportUrl(reportPath, filters) {
  const params = new URLSearchParams();
  const { from, to } = getDateRange(filters);
  params.set("from", from);
  params.set("to", to);
  if (filters.branch && filters.branch !== "all") params.set("branch", filters.branch);
  if (filters.department && filters.department !== "all") params.set("department", filters.department);
  return `${reportPath}?${params.toString()}`;
}
