"""SQL queries for HR approval tracking dashboard."""

from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np
from db.connection import execute_query

NOT_CANCELLED = "ISNULL(API_APRS, 0) <> 101"
IS_CANCELLED = "ISNULL(API_APRS, 0) = 101"

DEPT_NATURAL_ORDER = """
    CASE
        WHEN CHARINDEX('/', DEPT_CODE) > 0
        THEN LEFT(DEPT_CODE, CHARINDEX('/', DEPT_CODE) - 1)
        ELSE DEPT_CODE
    END,
    CASE
        WHEN CHARINDEX('/', DEPT_CODE) > 0
        THEN TRY_CAST(SUBSTRING(DEPT_CODE, CHARINDEX('/', DEPT_CODE) + 1, 20) AS INT)
        ELSE 0
    END,
    DEPT_CODE
"""

BASE_SELECT = f"""
SELECT
    RQI_REF,
    RQI_DATE,
    RQI_WBDT,
    WBDT_THAIDESC,
    DEPT_CODE,
    DEPT_THAIDESC,
    PRS_NO,
    Name,
    RQI_FROM_DATE,
    RQI_TO_DATE,
    RQI_ACTIVE,
    API_APRS,
    App_N1,
    App_DateN1,
    App_HR,
    App_DateHR,
    RQI_REMARK,
    CASE
        WHEN {IS_CANCELLED} THEN N'ไม่อนุมัติ'
        WHEN App_DateN1 IS NULL THEN N'รอหัวหน้า'
        WHEN App_DateHR IS NULL THEN N'รอ HR'
        ELSE N'อนุมัติครบ'
    END AS approval_stage,
    CASE
        WHEN {IS_CANCELLED} THEN N'ไม่อนุมัติ'
        WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NOT NULL THEN N'อนุมัติครบ'
        WHEN RQI_ACTIVE = 0 THEN N'อนุมัติครบ'
        ELSE N'ยังไม่ครบ'
    END AS active_label,
    DATEDIFF(day, RQI_DATE, App_DateN1) AS days_submit_to_n1,
    DATEDIFF(day, RQI_FROM_DATE, App_DateN1) AS days_leave_to_n1,
    DATEDIFF(day, RQI_FROM_DATE, App_DateHR) AS days_leave_to_hr,
    DATEDIFF(day, App_DateN1, App_DateHR) AS days_n1_to_hr,
    DATEDIFF(day, RQI_DATE, App_DateHR) AS days_submit_to_hr,
    CASE
        WHEN {IS_CANCELLED} THEN NULL
        WHEN App_DateN1 IS NULL THEN DATEDIFF(day, RQI_DATE, GETDATE())
        ELSE NULL
    END AS days_waiting_n1,
    CASE
        WHEN {IS_CANCELLED} THEN NULL
        WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NULL
        THEN DATEDIFF(day, CAST(App_DateN1 AS date), CAST(GETDATE() AS date))
        ELSE NULL
    END AS days_waiting_hr,
    CASE
        WHEN {IS_CANCELLED} THEN NULL
        WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NOT NULL THEN NULL
        WHEN RQI_FROM_DATE IS NOT NULL
             AND CAST(RQI_FROM_DATE AS date) < CAST(GETDATE() AS date)
        THEN DATEDIFF(day, CAST(RQI_FROM_DATE AS date), CAST(GETDATE() AS date))
        ELSE NULL
    END AS days_past_leave
FROM dbo.ZHR_WEBAPP
WHERE 1 = 1
"""


def _apply_filters(
    sql: str,
    params: dict[str, Any],
    date_from: Optional[str],
    date_to: Optional[str],
    dept: Optional[str],
    wbdt: Optional[int],
    stage: Optional[str],
    active: Optional[int],
) -> tuple[str, dict[str, Any]]:
    if date_from:
        sql += " AND RQI_DATE >= :date_from"
        params["date_from"] = date_from

    if date_to:
        sql += " AND RQI_DATE <= :date_to"
        params["date_to"] = date_to

    if dept:
        sql += " AND DEPT_CODE = :dept"
        params["dept"] = dept

    if wbdt is not None:
        sql += " AND RQI_WBDT = :wbdt"
        params["wbdt"] = wbdt

    if stage == "cancelled":
        sql += f" AND {IS_CANCELLED}"
    elif stage == "pending_n1":
        sql += f" AND {NOT_CANCELLED} AND App_DateN1 IS NULL"
    elif stage == "pending_hr":
        sql += f" AND {NOT_CANCELLED} AND App_DateN1 IS NOT NULL AND App_DateHR IS NULL"
    elif stage == "complete":
        sql += f" AND {NOT_CANCELLED} AND App_DateN1 IS NOT NULL AND App_DateHR IS NOT NULL"
    elif stage == "incomplete":
        sql += f" AND {NOT_CANCELLED} AND (App_DateN1 IS NULL OR App_DateHR IS NULL)"

    if active is not None:
        if int(active) == 0:
            sql += f" AND {NOT_CANCELLED} AND App_DateN1 IS NOT NULL AND App_DateHR IS NOT NULL"
        elif int(active) == 2:
            sql += f" AND {NOT_CANCELLED} AND (App_DateN1 IS NULL OR App_DateHR IS NULL)"

    return sql, params


def _sanitize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (float, np.floating)):
        if math.isnan(value) or math.isinf(value):
            return None
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):
        return _sanitize_value(value.item())
    return value


def _df_to_records(df) -> list[dict]:
    if df.empty:
        return []
    return [
        {key: _sanitize_value(val) for key, val in row.items()}
        for row in df.to_dict(orient="records")
    ]


def _filter_base(
    date_from: Optional[str],
    date_to: Optional[str],
    dept: Optional[str],
    wbdt: Optional[int],
    stage: Optional[str] = None,
    active: Optional[int] = None,
) -> tuple[str, dict[str, Any]]:
    params: dict[str, Any] = {}
    return _apply_filters(
        BASE_SELECT, params, date_from, date_to, dept, wbdt, stage, active
    )


def get_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
) -> dict:
    base, params = _filter_base(date_from, date_to, dept, wbdt)

    sql = f"""
    SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN {IS_CANCELLED} THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NULL THEN 1 ELSE 0 END) AS wait_n1,
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NULL THEN 1 ELSE 0 END) AS wait_hr,
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NOT NULL THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NULL OR App_DateHR IS NULL THEN 1 ELSE 0 END) AS active_incomplete,
        AVG(CAST(DATEDIFF(day, RQI_DATE, App_DateN1) AS float)) AS avg_submit_to_n1,
        AVG(CAST(DATEDIFF(day, RQI_FROM_DATE, App_DateN1) AS float)) AS avg_leave_to_n1,
        AVG(CAST(DATEDIFF(day, App_DateN1, App_DateHR) AS float)) AS avg_n1_to_hr,
        AVG(CAST(DATEDIFF(day, RQI_FROM_DATE, App_DateHR) AS float)) AS avg_leave_to_hr,
        AVG(CAST(DATEDIFF(day, RQI_DATE, App_DateHR) AS float)) AS avg_submit_to_hr
    FROM ({base}) AS q
    """
    row = execute_query(sql, params).iloc[0].to_dict()
    for key, value in list(row.items()):
        row[key] = _sanitize_value(value)
        if row[key] is None and key != "total":
            row[key] = 0
    return row


def get_by_dept(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
) -> list[dict]:
    base, params = _filter_base(date_from, date_to, dept, wbdt)

    sql = f"""
    SELECT DEPT_CODE, DEPT_THAIDESC, total
    FROM (
        SELECT TOP 15
            DEPT_CODE,
            DEPT_THAIDESC,
            COUNT(*) AS total
        FROM ({base}) AS q
        WHERE {NOT_CANCELLED}
          AND RQI_WBDT = 2
          AND (App_DateN1 IS NOT NULL OR App_DateHR IS NOT NULL)
        GROUP BY DEPT_CODE, DEPT_THAIDESC
        ORDER BY COUNT(*) DESC
    ) AS top_depts
    ORDER BY {DEPT_NATURAL_ORDER}
    """
    return _df_to_records(execute_query(sql, params))


def get_by_type(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
) -> list[dict]:
    base, params = _filter_base(date_from, date_to, dept, None)

    sql = f"""
    SELECT
        RQI_WBDT,
        CASE RQI_WBDT
            WHEN 1 THEN N'ขออนุมัติล่วงเวลา'
            WHEN 2 THEN N'ขออนุมัติลาประเภทต่างๆ'
            ELSE MAX(WBDT_THAIDESC)
        END AS WBDT_THAIDESC,
        COUNT(*) AS total,
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NULL THEN 1 ELSE 0 END) AS wait_n1,
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NULL THEN 1 ELSE 0 END) AS wait_hr
    FROM ({base}) AS q
    GROUP BY RQI_WBDT
    HAVING SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NULL OR App_DateHR IS NULL THEN 1 ELSE 0 END) > 0
    ORDER BY
        SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NULL THEN 1 ELSE 0 END)
        + SUM(CASE WHEN {IS_CANCELLED} THEN 0 WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NULL THEN 1 ELSE 0 END) DESC
    """
    return _df_to_records(execute_query(sql, params))


def get_records(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    dept: Optional[str] = None,
    wbdt: Optional[int] = None,
    stage: Optional[str] = None,
    active: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 500,
) -> list[dict]:
    params: dict[str, Any] = {"limit": limit}
    sql, params = _apply_filters(
        BASE_SELECT, params, date_from, date_to, dept, wbdt, stage, active
    )

    if search:
        sql += " AND (RQI_REF LIKE :search OR Name LIKE :search OR App_N1 LIKE :search OR App_HR LIKE :search)"
        params["search"] = f"%{search}%"

    sql = f"SELECT TOP (:limit) * FROM ({sql}) AS q ORDER BY RQI_DATE DESC, RQI_REF DESC"
    return _df_to_records(execute_query(sql, params))


def get_alert_items(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    warn_n1: int = 3,
    warn_hr: int = 5,
    crit_n1: int = 7,
    crit_hr: int = 14,
    limit: int = 15,
) -> list[dict]:
    params: dict[str, Any] = {
        "warn_n1": warn_n1,
        "warn_hr": warn_hr,
        "crit_n1": crit_n1,
        "crit_hr": crit_hr,
        "limit": limit,
    }
    base, params = _apply_filters(
        BASE_SELECT, params, date_from, date_to, None, None, "incomplete", None
    )

    sql = f"""
    SELECT TOP (:limit) *,
        CASE
            WHEN App_DateN1 IS NULL AND DATEDIFF(day, RQI_DATE, GETDATE()) >= :crit_n1 THEN 'critical'
            WHEN App_DateHR IS NULL AND DATEDIFF(day, App_DateN1, GETDATE()) >= :crit_hr THEN 'critical'
            WHEN App_DateN1 IS NULL AND DATEDIFF(day, RQI_DATE, GETDATE()) >= :warn_n1 THEN 'warning'
            WHEN App_DateHR IS NULL AND DATEDIFF(day, App_DateN1, GETDATE()) >= :warn_hr THEN 'warning'
            ELSE 'normal'
        END AS severity
    FROM ({base}) AS q
    WHERE
        (App_DateN1 IS NULL AND DATEDIFF(day, RQI_DATE, GETDATE()) >= :warn_n1)
        OR (
            App_DateN1 IS NOT NULL AND App_DateHR IS NULL
            AND DATEDIFF(day, App_DateN1, GETDATE()) >= :warn_hr
        )
    ORDER BY
        CASE
            WHEN App_DateN1 IS NULL AND DATEDIFF(day, RQI_DATE, GETDATE()) >= :crit_n1 THEN 0
            WHEN App_DateHR IS NULL AND DATEDIFF(day, App_DateN1, GETDATE()) >= :crit_hr THEN 0
            ELSE 1
        END,
        COALESCE(days_waiting_hr, days_waiting_n1, 0) DESC
    """
    return _df_to_records(execute_query(sql, params))


def get_alerts(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    warn_n1: int = 3,
    warn_hr: int = 5,
    crit_n1: int = 7,
    crit_hr: int = 14,
) -> dict:
    params: dict[str, Any] = {
        "warn_n1": warn_n1,
        "warn_hr": warn_hr,
        "crit_n1": crit_n1,
        "crit_hr": crit_hr,
    }
    base, params = _apply_filters(
        BASE_SELECT, params, date_from, date_to, None, None, "incomplete", None
    )

    sql = f"""
    SELECT
        SUM(CASE WHEN App_DateN1 IS NULL AND DATEDIFF(day, RQI_DATE, GETDATE()) >= :warn_n1 THEN 1 ELSE 0 END) AS warn_pending_n1,
        SUM(CASE WHEN App_DateN1 IS NULL AND DATEDIFF(day, RQI_DATE, GETDATE()) >= :crit_n1 THEN 1 ELSE 0 END) AS crit_pending_n1,
        SUM(CASE WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NULL AND DATEDIFF(day, App_DateN1, GETDATE()) >= :warn_hr THEN 1 ELSE 0 END) AS warn_pending_hr,
        SUM(CASE WHEN App_DateN1 IS NOT NULL AND App_DateHR IS NULL AND DATEDIFF(day, App_DateN1, GETDATE()) >= :crit_hr THEN 1 ELSE 0 END) AS crit_pending_hr
    FROM ({base}) AS q
    """
    row = execute_query(sql, params).iloc[0].to_dict()
    for key, value in row.items():
        row[key] = int(value or 0)

    row["items"] = get_alert_items(
        date_from=date_from,
        date_to=date_to,
        warn_n1=warn_n1,
        warn_hr=warn_hr,
        crit_n1=crit_n1,
        crit_hr=crit_hr,
    )
    return row


def get_filter_options() -> dict:
    depts = execute_query(
        """
        SELECT DISTINCT DEPT_CODE, DEPT_THAIDESC
        FROM dbo.ZHR_WEBAPP
        WHERE DEPT_CODE IS NOT NULL
        ORDER BY DEPT_CODE
        """
    )
    types = execute_query(
        """
        SELECT DISTINCT RQI_WBDT,
            CASE RQI_WBDT
                WHEN 1 THEN N'ขออนุมัติล่วงเวลา'
                WHEN 2 THEN N'ขออนุมัติลาประเภทต่างๆ'
                ELSE WBDT_THAIDESC
            END AS WBDT_THAIDESC
        FROM dbo.ZHR_WEBAPP
        WHERE RQI_WBDT IS NOT NULL
        ORDER BY RQI_WBDT
        """
    )
    return {
        "departments": _df_to_records(depts),
        "types": _df_to_records(types),
    }
