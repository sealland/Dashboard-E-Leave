"""Executive Dashboard hub — FastAPI application."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.auth import Authorization, can_access_report, get_authorization, REPORT_E_LEAVE
from app.dashboards import DASHBOARDS, get_dashboard, get_dashboard_config_json, get_dashboard_ui
from app.report_acl import (
    add_report_acl,
    delete_report_acl,
    list_authorization_users,
    list_report_acl,
    list_report_options,
)
from app.requirements import NEXT_DASHBOARD_REQUIREMENTS
from app.queries import get_alerts, get_by_dept, get_by_type, get_filter_options, get_records, get_summary
from app.time_attendance_proxy import proxy_time_attendance
from app import zhr_auth_admin

APP_DIR = Path(__file__).resolve().parent

app = FastAPI(title="HR Approve", version="1.0.0")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
templates = Jinja2Templates(directory=APP_DIR / "templates")


class ReportAclBody(BaseModel):
    prs_no: str = Field(min_length=1)
    report_code: str = Field(min_length=1)


class ZhrAuthorizationCreateBody(BaseModel):
    prsNo: str = Field(min_length=1)
    deptCode: str = Field(min_length=1)
    brCode: Optional[str] = None


class ZhrAuthorizationUpdateBody(BaseModel):
    prsNo: str = Field(min_length=1)
    oldDeptCode: Optional[str] = None
    oldBrCode: Optional[str] = None
    deptCode: str = Field(min_length=1)
    brCode: Optional[str] = None


class ZhrAuthorizationDeleteBody(BaseModel):
    prsNo: str = Field(min_length=1)
    deptCode: str = Field(min_length=1)
    brCode: Optional[str] = None


def _with_auth_query(url: str | None, c: Optional[str]) -> str | None:
    """Append ?c= / &c= to dashboard URLs so auth survives navigation without JS."""
    from urllib.parse import quote

    if not url:
        return url
    code = (c or "").strip()
    if not code:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}c={quote(code, safe='')}"


def _nav_context(
    active_dashboard: str | None = None,
    c: Optional[str] = None,
    auth: Optional[Authorization] = None,
) -> dict:
    code = (c or "").strip() or None
    can_maintain = bool(auth and auth.can_maintain)
    is_all_scope = bool(auth and auth.is_all_scope)
    dashboards = []
    for item in DASHBOARDS:
        hidden_default = not item.get("show_on_landing", True)
        # Hidden modules (e.g. EMC) visible to DEPT=ALL · BR=ALL (including executives)
        if hidden_default and not is_all_scope:
            continue
        if auth and auth.active and auth.allowed and not can_access_report(auth, item["id"]):
            continue
        dashboards.append(
            {
                **item,
                "url": _with_auth_query(item.get("url"), code),
                "hidden_default": hidden_default,
            }
        )
    return {
        "dashboards": dashboards,
        "active_dashboard": active_dashboard,
        "auth_c": code,
        "can_maintain": can_maintain,
        "maintain_url": _with_auth_query("/maintain/reports", code) if can_maintain else None,
    }


def _auth_from_c(c: Optional[str]) -> Authorization:
    return get_authorization(c)


def _require_auth(c: Optional[str]) -> Authorization:
    auth = _auth_from_c(c)
    if not auth.allowed:
        raise HTTPException(
            status_code=403,
            detail=auth.to_dict().get("message")
            or "ไม่พบสิทธิ์ — กรุณาระบุรหัสพนักงาน (?c=PRS_NO)",
        )
    return auth


def _require_report(c: Optional[str], report_code: str) -> Authorization:
    auth = _require_auth(c)
    if not can_access_report(auth, report_code):
        raise HTTPException(
            status_code=403,
            detail=f"ไม่มีสิทธิ์เข้าใช้งานรายงานนี้ ({report_code})",
        )
    return auth


def _require_maintainer(c: Optional[str]) -> Authorization:
    auth = _require_auth(c)
    if not auth.can_maintain:
        raise HTTPException(
            status_code=403,
            detail="หน้า Maintain ใช้ได้เฉพาะผู้ที่มีสิทธิ์ DEPT=ALL และ BR=ALL",
        )
    return auth


def _dashboard_page_context(dashboard_id: str, c: Optional[str] = None) -> dict:
    dashboard = get_dashboard(dashboard_id)
    if not dashboard or not dashboard.get("template"):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    auth = _auth_from_c(c) if c else None
    return {
        **_nav_context(dashboard_id, c=c, auth=auth),
        "dashboard": dashboard,
        "ui": get_dashboard_ui(dashboard_id),
        "dashboard_config": get_dashboard_config_json(dashboard_id),
    }


@app.get("/", response_class=HTMLResponse)
async def landing(request: Request):
    c = request.query_params.get("c")
    auth = _auth_from_c(c) if c else None
    return templates.TemplateResponse(
        request,
        "landing.html",
        {"request": request, **_nav_context(c=c, auth=auth)},
    )


@app.get("/dashboard/{dashboard_id}", response_class=HTMLResponse)
async def dashboard_page(request: Request, dashboard_id: str):
    c = request.query_params.get("c")
    if dashboard_id == "e-leave":
        _require_report(c, REPORT_E_LEAVE)
    ctx = _dashboard_page_context(dashboard_id, c=c)
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


@app.get("/maintain/reports", response_class=HTMLResponse)
async def maintain_reports_page(request: Request):
    c = request.query_params.get("c")
    auth = _require_maintainer(c)
    return templates.TemplateResponse(
        request,
        "maintain_reports.html",
        {"request": request, **_nav_context(c=c, auth=auth)},
    )


@app.get("/api/admin/report-acl/meta")
async def api_admin_report_acl_meta(c: Optional[str] = None):
    auth = _require_maintainer(c)
    return {
        "reports": list_report_options(),
        "users": list_authorization_users(),
        "auth": auth.to_dict(),
    }


@app.get("/api/admin/report-acl")
async def api_admin_report_acl_list(
    c: Optional[str] = None,
    prs_no: Optional[str] = None,
):
    auth = _require_maintainer(c)
    return {
        "rows": list_report_acl(prs_no),
        "auth": auth.to_dict(),
    }


@app.post("/api/admin/report-acl")
async def api_admin_report_acl_add(body: ReportAclBody, c: Optional[str] = None):
    auth = _require_maintainer(c)
    try:
        row = add_report_acl(body.prs_no, body.report_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "row": row, "auth": auth.to_dict()}


@app.delete("/api/admin/report-acl")
async def api_admin_report_acl_delete(
    c: Optional[str] = None,
    prs_no: Optional[str] = None,
    report_code: Optional[str] = None,
):
    auth = _require_maintainer(c)
    try:
        deleted = delete_report_acl(prs_no or "", report_code or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="ไม่พบรายการที่จะลบ")
    return {"ok": True, "auth": auth.to_dict()}


def _zhr_admin_call(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"ok": False, "error": str(exc)})
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": f"Server error: {exc}"},
        )


@app.get("/api/admin/zhr-auth/authorizations")
async def api_admin_zhr_authorizations(
    prsNo: Optional[str] = None,
    deptCode: Optional[str] = None,
    brCode: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=2000),
    c: Optional[str] = None,
):
    _require_maintainer(c)
    return _zhr_admin_call(
        zhr_auth_admin.list_authorizations,
        prs_no=prsNo,
        dept_code=deptCode,
        br_code=brCode,
        page=page,
        limit=limit,
    )


@app.get("/api/admin/zhr-auth/authorizations/tree")
async def api_admin_zhr_authorizations_tree(c: Optional[str] = None):
    _require_maintainer(c)
    return _zhr_admin_call(zhr_auth_admin.get_authorization_tree)


@app.get("/api/admin/zhr-auth/authorizations/{prs_no}")
async def api_admin_zhr_authorization_detail(
    prs_no: str,
    c: Optional[str] = None,
):
    _require_maintainer(c)
    return _zhr_admin_call(zhr_auth_admin.get_authorization_detail, prs_no)


@app.post("/api/admin/zhr-auth/authorizations")
async def api_admin_zhr_authorization_create(
    body: ZhrAuthorizationCreateBody,
    c: Optional[str] = None,
):
    auth = _require_maintainer(c)
    return _zhr_admin_call(
        zhr_auth_admin.create_authorization,
        prs_no=body.prsNo,
        dept_code=body.deptCode,
        br_code=body.brCode,
        changed_by=auth.prs_no,
    )


@app.put("/api/admin/zhr-auth/authorizations")
async def api_admin_zhr_authorization_update(
    body: ZhrAuthorizationUpdateBody,
    c: Optional[str] = None,
):
    auth = _require_maintainer(c)
    return _zhr_admin_call(
        zhr_auth_admin.update_authorization,
        prs_no=body.prsNo,
        old_dept_code=body.oldDeptCode,
        old_br_code=body.oldBrCode,
        dept_code=body.deptCode,
        br_code=body.brCode,
        changed_by=auth.prs_no,
    )


@app.delete("/api/admin/zhr-auth/authorizations")
async def api_admin_zhr_authorization_delete(
    body: Optional[ZhrAuthorizationDeleteBody] = Body(default=None),
    prsNo: Optional[str] = None,
    deptCode: Optional[str] = None,
    brCode: Optional[str] = None,
    c: Optional[str] = None,
):
    auth = _require_maintainer(c)
    target_prs = body.prsNo if body else prsNo
    target_dept = body.deptCode if body else deptCode
    target_branch = body.brCode if body else brCode
    if not target_prs or not target_dept:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "PRS_NO and DEPT_CODE are required"},
        )
    result = _zhr_admin_call(
        zhr_auth_admin.delete_authorization,
        prs_no=target_prs,
        dept_code=target_dept,
        br_code=target_branch,
        changed_by=auth.prs_no,
    )
    if result is None:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": "Authorization not found"},
        )
    return result


@app.get("/api/admin/zhr-auth/audit-logs")
async def api_admin_zhr_audit_logs(
    prsNo: Optional[str] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    action: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=2000),
    c: Optional[str] = None,
):
    _require_maintainer(c)
    return _zhr_admin_call(
        zhr_auth_admin.list_audit_logs,
        prs_no=prsNo,
        date_from=dateFrom,
        date_to=dateTo,
        action=action,
        page=page,
        limit=limit,
    )


@app.get("/api/admin/zhr-auth/employees")
async def api_admin_zhr_employees(
    search: Optional[str] = None,
    c: Optional[str] = None,
):
    _require_maintainer(c)
    return _zhr_admin_call(zhr_auth_admin.list_employees, search)


@app.get("/api/admin/zhr-auth/departments")
async def api_admin_zhr_departments(c: Optional[str] = None):
    _require_maintainer(c)
    return _zhr_admin_call(zhr_auth_admin.list_departments)


@app.get("/api/admin/zhr-auth/branches")
async def api_admin_zhr_branches(
    deptCode: Optional[str] = None,
    c: Optional[str] = None,
):
    _require_maintainer(c)
    return _zhr_admin_call(zhr_auth_admin.list_branches, deptCode)


@app.get("/api/auth")
async def api_auth(c: Optional[str] = None):
    auth = _auth_from_c(c)
    return auth.to_dict()


@app.get("/api/summary")
async def api_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
    doc_kind: Optional[str] = None,
    c: Optional[str] = None,
):
    auth = _require_report(c, REPORT_E_LEAVE)
    return {
        "summary": get_summary(
            date_from=date_from,
            date_to=date_to,
            dept=dept,
            wbdt=wbdt,
            doc_kind=doc_kind,
            auth=auth,
        ),
        "by_dept": get_by_dept(
            date_from=date_from,
            date_to=date_to,
            dept=dept,
            wbdt=wbdt,
            doc_kind=doc_kind,
            auth=auth,
        ),
        "by_type": get_by_type(
            date_from=date_from,
            date_to=date_to,
            dept=dept,
            doc_kind=doc_kind,
            auth=auth,
        ),
        "auth": auth.to_dict(),
    }


@app.get("/api/records")
async def api_records(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
    doc_kind: Optional[str] = None,
    stage: Optional[str] = None,
    active: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(500, ge=1, le=2000),
    c: Optional[str] = None,
):
    auth = _require_report(c, REPORT_E_LEAVE)
    return get_records(
        date_from=date_from,
        date_to=date_to,
        dept=dept,
        wbdt=wbdt,
        doc_kind=doc_kind,
        stage=stage,
        active=active,
        search=search,
        limit=limit,
        auth=auth,
    )


@app.get("/api/alerts")
async def api_alerts(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    doc_kind: Optional[str] = None,
    warn_n1: int = Query(3, ge=1),
    warn_hr: int = Query(5, ge=1),
    crit_n1: int = Query(7, ge=1),
    crit_hr: int = Query(14, ge=1),
    c: Optional[str] = None,
):
    auth = _require_report(c, REPORT_E_LEAVE)
    return get_alerts(
        date_from=date_from,
        date_to=date_to,
        doc_kind=doc_kind,
        warn_n1=warn_n1,
        warn_hr=warn_hr,
        crit_n1=crit_n1,
        crit_hr=crit_hr,
        auth=auth,
    )


@app.get("/api/filters")
async def api_filters(c: Optional[str] = None):
    auth = _auth_from_c(c)
    if not auth.allowed or not can_access_report(auth, REPORT_E_LEAVE):
        return {
            "departments": [],
            "types": [],
            "auth": auth.to_dict(),
        }
    payload = get_filter_options(auth=auth)
    payload["auth"] = auth.to_dict()
    return payload


_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


@app.get("/hr-approve")
async def redirect_hr_approve(request: Request):
    query = request.url.query
    target = "/hr-approve/"
    if query:
        target = f"{target}?{query}"
    return RedirectResponse(url=target, status_code=307)


@app.api_route("/hr-approve/", methods=_PROXY_METHODS)
async def proxy_hr_approve_root(request: Request):
    return await proxy_time_attendance(request)


@app.api_route("/hr-approve/{path:path}", methods=_PROXY_METHODS)
async def proxy_hr_approve(request: Request, path: str):
    return await proxy_time_attendance(request, path)
