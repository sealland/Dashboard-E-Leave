"""Registry of executive dashboards — extend when adding new modules."""

from __future__ import annotations

from typing import TypedDict


class DashboardItem(TypedDict):
    id: str
    title: str
    description: str
    url: str | None
    icon: str
    coming_soon: bool


DASHBOARDS: list[DashboardItem] = [
    {
        "id": "e-leave",
        "title": "Dashboard E-Leave",
        "description": "ติดตามการอนุมัติลา หัวหน้างาน และ HR จากระบบคำร้อง",
        "url": "/dashboard/e-leave",
        "icon": "leave",
        "coming_soon": False,
    },
    {
        "id": "e-overtime",
        "title": "Dashboard E-Overtime",
        "description": "ติดตามการอนุมัติล่วงเวลา (เตรียมไว้สำหรับอนาคต)",
        "url": None,
        "icon": "overtime",
        "coming_soon": True,
    },
    {
        "id": "e-approval",
        "title": "Dashboard Approval Summary",
        "description": "ภาพรวมการอนุมัติทุกประเภท (เตรียมไว้สำหรับอนาคต)",
        "url": None,
        "icon": "summary",
        "coming_soon": True,
    },
]


def get_dashboard(dashboard_id: str) -> DashboardItem | None:
    return next((d for d in DASHBOARDS if d["id"] == dashboard_id), None)
