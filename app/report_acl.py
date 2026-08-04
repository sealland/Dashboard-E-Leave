"""CRUD for dbo.ZHR_AUTHORIZATION_REPORT (report module ACL)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text

from app.auth import ALL_REPORT_CODES
from db.connection import execute_query, get_engine

REPORT_LABELS: dict[str, str] = {
    "e-leave": "Dashboard E-Leave",
    "time-attendance": "Time Attendance",
    "emc-report": "HR Monthly Performance",
    "ALL": "ทุกรายงาน (ALL)",
}


def list_report_options() -> list[dict[str, str]]:
    options = [{"code": "ALL", "label": REPORT_LABELS["ALL"]}]
    for code in ALL_REPORT_CODES:
        options.append({"code": code, "label": REPORT_LABELS.get(code, code)})
    return options


def list_authorization_users() -> list[dict[str, Any]]:
    df = execute_query(
        """
        SELECT
            LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) AS prs_no,
            MAX(CASE WHEN UPPER(LTRIM(RTRIM(CAST(DEPT_CODE AS NVARCHAR(100))))) = 'ALL' THEN 1 ELSE 0 END) AS has_all_dept,
            MAX(CASE WHEN UPPER(LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(100))))) = 'ALL' THEN 1 ELSE 0 END) AS has_all_branch,
            COUNT(*) AS row_count
        FROM dbo.ZHR_AUTHORIZATION
        WHERE PRS_NO IS NOT NULL
          AND LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) <> ''
        GROUP BY LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50))))
        ORDER BY prs_no
        """
    )
    if df.empty:
        return []
    rows = []
    for row in df.to_dict(orient="records"):
        rows.append(
            {
                "prs_no": str(row.get("prs_no") or "").strip(),
                "has_all_dept": bool(row.get("has_all_dept")),
                "has_all_branch": bool(row.get("has_all_branch")),
                "row_count": int(row.get("row_count") or 0),
            }
        )
    return rows


def list_report_acl(prs_no: Optional[str] = None) -> list[dict[str, str]]:
    params: dict[str, Any] = {}
    where = "1 = 1"
    code = str(prs_no or "").strip()
    if code:
        where = """
            LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = :prs_no
            OR (
                TRY_CAST(PRS_NO AS BIGINT) IS NOT NULL
                AND TRY_CAST(:prs_no_num AS BIGINT) IS NOT NULL
                AND TRY_CAST(PRS_NO AS BIGINT) = TRY_CAST(:prs_no_num AS BIGINT)
            )
        """
        params = {"prs_no": code, "prs_no_num": code}

    df = execute_query(
        f"""
        SELECT
            LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) AS prs_no,
            LTRIM(RTRIM(CAST(REPORT_CODE AS NVARCHAR(50)))) AS report_code
        FROM dbo.ZHR_AUTHORIZATION_REPORT
        WHERE {where}
        ORDER BY prs_no, report_code
        """,
        params,
    )
    if df.empty:
        return []
    result = []
    for row in df.to_dict(orient="records"):
        report_code = str(row.get("report_code") or "").strip()
        result.append(
            {
                "prs_no": str(row.get("prs_no") or "").strip(),
                "report_code": report_code,
                "report_label": REPORT_LABELS.get(report_code, report_code),
            }
        )
    return result


def add_report_acl(prs_no: str, report_code: str) -> dict[str, str]:
    prs = str(prs_no or "").strip()
    report = str(report_code or "").strip()
    if not prs:
        raise ValueError("ต้องระบุรหัสพนักงาน (PRS_NO)")
    if not report:
        raise ValueError("ต้องระบุ REPORT_CODE")
    allowed = {"ALL", *ALL_REPORT_CODES}
    if report not in allowed:
        raise ValueError(f"REPORT_CODE ไม่ถูกต้อง: {report}")

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                IF NOT EXISTS (
                    SELECT 1
                    FROM dbo.ZHR_AUTHORIZATION_REPORT
                    WHERE LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = :prs_no
                      AND LTRIM(RTRIM(CAST(REPORT_CODE AS NVARCHAR(50)))) = :report_code
                )
                INSERT INTO dbo.ZHR_AUTHORIZATION_REPORT (PRS_NO, REPORT_CODE)
                VALUES (:prs_no, :report_code)
                """
            ),
            {"prs_no": prs, "report_code": report},
        )
    return {
        "prs_no": prs,
        "report_code": report,
        "report_label": REPORT_LABELS.get(report, report),
    }


def delete_report_acl(prs_no: str, report_code: str) -> bool:
    prs = str(prs_no or "").strip()
    report = str(report_code or "").strip()
    if not prs or not report:
        raise ValueError("ต้องระบุ PRS_NO และ REPORT_CODE")

    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                DELETE FROM dbo.ZHR_AUTHORIZATION_REPORT
                WHERE LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = :prs_no
                  AND LTRIM(RTRIM(CAST(REPORT_CODE AS NVARCHAR(50)))) = :report_code
                """
            ),
            {"prs_no": prs, "report_code": report},
        )
        return bool(result.rowcount and result.rowcount > 0)
