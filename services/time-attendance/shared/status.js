export function getRowStatus(row) {
  if (row.absent > 0) return { label: "ขาดงาน", className: "absent", priority: 4 };
  if (row.lateTimes > 0) return { label: "มาสาย", className: "late", priority: 3 };
  if (row.scanIncomplete > 0 || row.noScanIn > 0) {
    return { label: "สแกนไม่ครบ", className: "scan", priority: 2 };
  }

  const leaveScore =
    row.leaveBusiness +
    row.leaveSpecial +
    row.vacation +
    row.sickNo +
    row.sickYes +
    row.maternity +
    row.sterilization +
    row.military +
    row.training +
    row.ordination +
    row.returnCountry +
    row.leaveKk;

  if (leaveScore > 0) return { label: "ลางาน", className: "leave", priority: 1 };
  return { label: "ปกติ", className: "normal", priority: 0 };
}

export function hasAbsent(row) {
  return row.absent > 0;
}

export function hasLate(row) {
  return row.lateTimes > 0;
}
