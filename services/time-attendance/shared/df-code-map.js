export const LATE_DF_CODES = ["2120", "2121"];

export function isLateRecord(row) {
  return LATE_DF_CODES.includes(String(row.DF_CODE ?? ""));
}
