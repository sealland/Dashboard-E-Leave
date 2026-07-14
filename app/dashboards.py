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
    doc_kind: str | None
    subtitle: str


DASHBOARDS: list[DashboardItem] = [
    {
        "id": "e-leave",
        "title": "Dashboard E-Leave",
        "description": "ติดตามการอนุมัติลาและ OT หัวหน้างาน และ HR จากระบบคำร้อง",
        "subtitle": "ลา (L) · โอที (T) — หัวหน้างาน (App_DateN1) และ HR (App_DateHR)",
        "url": "/dashboard/e-leave",
        "icon": "leave",
        "coming_soon": False,
        "status": "live",
        "template": "dashboards/page.html",
        "wbdt": None,
        "doc_kind": "L",
    },
    {
        "id": "time-attendance",
        "title": "Time Attendance",
        "description": "รายงานลา มาสาย และโอที จากระบบลงเวลา",
        "subtitle": "ข้อมูลจากระบบลงเวลา",
        "url": "/hr-approve/",
        "icon": "attendance",
        "coming_soon": False,
        "status": "live",
        "template": None,
        "wbdt": None,
        "doc_kind": None,
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
        "doc_kind": None,
    },
]


DASHBOARD_UI: dict[str, dict[str, str]] = {
    "e-leave": {
        "chart_dept_title": "แยกตามแผนก (Top 15)",
        "chart_type_title": "แยกตามประเภท (ค้างอนุมัติ)",
        "records_title": "รายการคำร้อง",
        "request_date_label": "วันขอลา/OT",
        "active_filter_label": "สถานะเอกสาร",
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
        "doc_kind": item.get("doc_kind"),
        "status": item["status"],
        "dateStorageKey": f"hr_dashboard_{item['id']}_date_range",
    }
