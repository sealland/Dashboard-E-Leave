"""Registry of executive dashboards — extend when adding new modules."""

from __future__ import annotations

from typing import Literal, TypedDict

DashboardStatus = Literal["live", "scaffold", "soon"]


class DashboardItem(TypedDict):
    id: str
    title: str
    description: str
    url: str | None
    icon: str
    coming_soon: bool
    status: DashboardStatus
    template: str | None
    wbdt: int | None
    subtitle: str


DASHBOARDS: list[DashboardItem] = [
    {
        "id": "e-leave",
        "title": "Dashboard E-Leave",
        "description": "ติดตามการอนุมัติลา หัวหน้างาน และ HR จากระบบคำร้อง",
        "subtitle": "หัวหน้างาน (App_DateN1) และ HR (App_DateHR)",
        "url": "/dashboard/e-leave",
        "icon": "leave",
        "coming_soon": False,
        "status": "live",
        "template": "dashboards/page.html",
        "wbdt": 2,
    },
    {
        "id": "time-attendance",
        "title": "Time Attendance",
        "description": "สรุปภาพรวมการมาทำงาน ขาด สาย ลา และสแกนไม่ครบ",
        "subtitle": "ข้อมูลจากระบบลงเวลา",
        "url": "/hr-approve/",
        "icon": "attendance",
        "coming_soon": False,
        "status": "live",
        "template": None,
        "wbdt": None,
    },
    {
        "id": "e-approval",
        "title": "Dashboard Approval Summary",
        "description": "ภาพรวมการอนุมัติทุกประเภทคำร้อง — กำลังออกแบบ",
        "subtitle": "รวมลา · ล่วงเวลา · คำร้องอื่นๆ",
        "url": "/dashboard/e-approval",
        "icon": "summary",
        "coming_soon": False,
        "status": "scaffold",
        "template": "dashboards/requirements.html",
        "wbdt": None,
    },
]


DASHBOARD_UI: dict[str, dict[str, str]] = {
    "e-leave": {
        "chart_dept_title": "การลาแยกตามแผนก (Top 15)",
        "chart_type_title": "แยกตามประเภท (ค้างอนุมัติ)",
        "records_title": "รายการคำร้อง",
        "request_date_label": "วันขอลา",
        "active_filter_label": "สถานะใบลา",
        "scaffold_note": "",
    },
}


def get_dashboard(dashboard_id: str) -> DashboardItem | None:
    return next((d for d in DASHBOARDS if d["id"] == dashboard_id), None)


def get_dashboard_ui(dashboard_id: str) -> dict[str, str]:
    return DASHBOARD_UI.get(dashboard_id, DASHBOARD_UI["e-leave"])


def get_dashboard_config_json(dashboard_id: str) -> dict:
    item = get_dashboard(dashboard_id)
    if not item:
        return {}
    return {
        "id": item["id"],
        "wbdt": item["wbdt"],
        "status": item["status"],
        "dateStorageKey": f"hr_dashboard_{item['id']}_date_range",
    }
