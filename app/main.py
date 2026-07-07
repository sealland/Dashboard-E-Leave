"""Executive Dashboard hub — FastAPI application."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.dashboards import DASHBOARDS
from app.queries import get_alerts, get_by_dept, get_by_type, get_filter_options, get_records, get_summary

APP_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Executive Dashboard", version="1.0.0")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
templates = Jinja2Templates(directory=APP_DIR / "templates")


def _nav_context(active_dashboard: str | None = None) -> dict:
    return {"dashboards": DASHBOARDS, "active_dashboard": active_dashboard}


@app.get("/", response_class=HTMLResponse)
async def landing(request: Request):
    return templates.TemplateResponse(
        "landing.html",
        {"request": request, **_nav_context()},
    )


@app.get("/dashboard/e-leave", response_class=HTMLResponse)
async def dashboard_e_leave(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {"request": request, **_nav_context("e-leave")},
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
