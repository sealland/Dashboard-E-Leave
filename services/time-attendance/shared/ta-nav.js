/** Shared Time Attendance sidebar markup. active: home|leave|late|checkin|ot|ot-pdf|emc */
export function renderSidebarNav(active = "") {
  const item = (id, href, label) => {
    const cls = id === active ? "nav-item active" : "nav-item";
    const sub = id === "late" || id === "checkin" || id === "ot-pdf" ? " nav-item--sub" : "";
    return `<a class="${cls}${sub}" href="${href}">${label}</a>`;
  };

  return `
    <a class="nav-item" href="/">ศูนย์ Dashboard</a>
    ${item("home", "./", "Time Attendance")}
    <div class="nav-group">
      <p class="nav-group-label">Attendance</p>
      ${item("leave", "./index.html", "รายงานสถิติการลางาน")}
      ${item("late", "./report-late.html", "รายงานมาสาย")}
      ${item("checkin", "./report-checkin.html", "รายงานสแกนเข้างาน")}
    </div>
    <div class="nav-group">
      <p class="nav-group-label">Overtime</p>
      ${item("ot", "./report-ot.html", "รายงานค่าล่วงเวลา (Dashboard)")}
      ${item("ot-pdf", "./report-ot-pdf.html", "รายงาน OT พนักงาน (PDF)")}
    </div>
  `;
}

export function mountSidebarNav(active) {
  const nav = document.querySelector(".sidebar-nav");
  if (!nav) return;
  nav.innerHTML = renderSidebarNav(active);
}
