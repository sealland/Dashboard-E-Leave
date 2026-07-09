"""Executive Dashboard hub — FastAPI application."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.dashboards import DASHBOARDS, get_dashboard, get_dashboard_config_json, get_dashboard_ui
from app.requirements import NEXT_DASHBOARD_REQUIREMENTS
from app.queries import get_alerts, get_by_dept, get_by_type, get_filter_options, get_records, get_summary
from app.time_attendance_proxy import proxy_time_attendance

APP_DIR = Path(__file__).resolve().parent

app = FastAPI(title="HR Approve", version="1.0.0")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
templates = Jinja2Templates(directory=APP_DIR / "templates")


def _nav_context(active_dashboard: str | None = None) -> dict:
    return {"dashboards": DASHBOARDS, "active_dashboard": active_dashboard}


def _dashboard_page_context(dashboard_id: str) -> dict:
    dashboard = get_dashboard(dashboard_id)
    if not dashboard or not dashboard.get("template"):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {
        **_nav_context(dashboard_id),
        "dashboard": dashboard,
        "ui": get_dashboard_ui(dashboard_id),
        "dashboard_config": get_dashboard_config_json(dashboard_id),
    }


@app.get("/", response_class=HTMLResponse)
async def landing(request: Request):
    return templates.TemplateResponse(
        request,
        "landing.html",
        {"request": request, **_nav_context()},
    )


@app.get("/dashboard/{dashboard_id}", response_class=HTMLResponse)
async def dashboard_page(request: Request, dashboard_id: str):
    ctx = _dashboard_page_context(dashboard_id)
    dashboard = ctx["dashboard"]
    if dashboard["template"] == "dashboards/requirements.html":
        return templates.TemplateResponse(
            request,
            dashboard["template"],
            {
                "request": request,
                **ctx,
                "requirements": NEXT_DASHBOARD_REQUIREMENTS,
            },
        )
    return templates.TemplateResponse(
        request,
        dashboard["template"],
        {"request": request, **ctx},
    )


@app.get("/api/summary")
async def api_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
):
    return {
        "summary": get_summary(date_from=date_from, date_to=date_to, dept=dept, wbdt=wbdt),
        "by_dept": get_by_dept(date_from=date_from, date_to=date_to, dept=dept, wbdt=wbdt),
        "by_type": get_by_type(date_from=date_from, date_to=date_to, dept=dept),
    }


@app.get("/api/records")
async def api_records(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
    stage: Optional[str] = None,
    active: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(500, ge=1, le=2000),
):
    return get_records(
        date_from=date_from,
        date_to=date_to,
        dept=dept,
        wbdt=wbdt,
        stage=stage,
        active=active,
        search=search,
        limit=limit,
    )


@app.get("/api/alerts")
async def api_alerts(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    warn_n1: int = Query(3, ge=1),
    warn_hr: int = Query(5, ge=1),
    crit_n1: int = Query(7, ge=1),
    crit_hr: int = Query(14, ge=1),
):
    return get_alerts(
        date_from=date_from,
        date_to=date_to,
        warn_n1=warn_n1,
        warn_hr=warn_hr,
        crit_n1=crit_n1,
        crit_hr=crit_hr,
    )


@app.get("/api/filters")
async def api_filters():
    return get_filter_options()


_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


@app.get("/hr-approve")
async def redirect_hr_approve():
    return RedirectResponse(url="/hr-approve/", status_code=307)


@app.api_route("/hr-approve/", methods=_PROXY_METHODS)
async def proxy_hr_approve_root(request: Request):
    return await proxy_time_attendance(request)


@app.api_route("/hr-approve/{path:path}", methods=_PROXY_METHODS)
async def proxy_hr_approve(request: Request, path: str):
    return await proxy_time_attendance(request, path)
