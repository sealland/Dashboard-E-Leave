export const LATE_DF_CODES = ["2120", "2121"];

export const OT_DF_CODES = ["1110", "1120", "1130", "1140", "1150"];

export const OT_DF_LABELS = {
  1110: "ค่าล่วงเวลา X1",
  1120: "ค่าล่วงเวลา X1.5",
  1130: "ค่าล่วงเวลา X2",
  1140: "ค่าล่วงเวลา X3",
  1150: "ค่าล่วงเวลา",
};

export function isLateRecord(row) {
  return LATE_DF_CODES.includes(String(row.DF_CODE ?? ""));
}

export function isOvertimeRecord(row) {
  return OT_DF_CODES.includes(String(row.DF_CODE ?? ""));
}

export function getOvertimeLabel(dfCode) {
  return OT_DF_LABELS[String(dfCode)] ?? `OT ${dfCode}`;
}
