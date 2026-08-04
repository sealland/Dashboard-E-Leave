"""Administrative CRUD helpers for dbo.ZHR_AUTHORIZATION."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

import pandas as pd
from sqlalchemy import text

from db.connection import execute_query, get_engine


def _clean(value: Any) -> Any:
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {str(key): _clean(value) for key, value in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def _nullable_branch(value: Optional[str]) -> Optional[str]:
    branch = str(value or "").strip()
    return None if not branch or branch.upper() == "NULL" else branch


def _display_authorization(row: dict[str, Any]) -> dict[str, Any]:
    dept_code = _clean(row.get("DEPT_CODE"))
    br_code = _clean(row.get("BR_CODE"))
    dept_name = _clean(row.get("DEPT_NAME"))
    br_name = _clean(row.get("BR_NAME"))
    return {
        "deptCode": dept_code,
        "deptName": dept_name or ("ทุกแผนก" if dept_code == "ALL" else dept_code),
        "brCode": br_code,
        "brName": br_name
        or ("ทุกสาขา" if br_code == "ALL" else (br_code if br_code else "-")),
    }


def list_authorizations(
    prs_no: Optional[str] = None,
    dept_code: Optional[str] = None,
    br_code: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> dict[str, Any]:
    where = ["1 = 1"]
    params: dict[str, Any] = {}
    if prs_no:
        where.append("za.PRS_NO = :prs_no")
        params["prs_no"] = prs_no
    if dept_code:
        where.append(
            """
            (
                za.DEPT_CODE LIKE :dept_search
                OR EXISTS (
                    SELECT 1
                    FROM dbo.vw_employee_checkin d2
                    WHERE d2.DEPT_CODE = za.DEPT_CODE
                      AND d2.DEPT_THAIDESC LIKE :dept_search
                )
            )
            """
        )
        params["dept_search"] = f"%{dept_code}%"
    if br_code:
        where.append(
            "(za.BR_CODE = :br_code OR (za.BR_CODE IS NULL AND :br_code IS NULL))"
        )
        params["br_code"] = _nullable_branch(br_code)

    where_sql = " AND ".join(where)
    count_frame = execute_query(
        f"SELECT COUNT(*) AS total FROM dbo.ZHR_AUTHORIZATION za WHERE {where_sql}",
        params,
    )
    total = int(count_frame.iloc[0]["total"]) if not count_frame.empty else 0
    query_params = {
        **params,
        "offset": (page - 1) * limit,
        "limit": limit,
    }
    frame = execute_query(
        f"""
        SELECT
            za.PRS_NO,
            MAX(e.EMP_NAME) + ' ' + MAX(e.EMP_SURNME) AS EMP_FULLNAME,
            za.DEPT_CODE,
            MAX(d.DEPT_THAIDESC) AS DEPT_NAME,
            za.BR_CODE,
            MAX(b.BR_THAIDESC) AS BR_NAME
        FROM dbo.ZHR_AUTHORIZATION za
        LEFT JOIN (
            SELECT DISTINCT PRS_NO, EMP_NAME, EMP_SURNME
            FROM dbo.vw_employee_checkin
        ) e ON za.PRS_NO = e.PRS_NO
        LEFT JOIN (
            SELECT DISTINCT DEPT_CODE, DEPT_THAIDESC
            FROM dbo.vw_employee_checkin
        ) d ON za.DEPT_CODE = d.DEPT_CODE
        LEFT JOIN (
            SELECT DISTINCT BR_CODE, BR_THAIDESC
            FROM dbo.vw_employee_checkin
            WHERE BR_CODE IS NOT NULL
        ) b ON za.BR_CODE = b.BR_CODE
        WHERE {where_sql}
        GROUP BY za.PRS_NO, za.DEPT_CODE, za.BR_CODE
        ORDER BY za.PRS_NO, za.DEPT_CODE, za.BR_CODE
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        """,
        query_params,
    )

    grouped: dict[str, dict[str, Any]] = {}
    for row in _records(frame):
        prs = str(row.get("PRS_NO") or "")
        if prs not in grouped:
            grouped[prs] = {
                "prsNo": prs,
                "empName": row.get("EMP_FULLNAME") or prs,
                "count": 0,
                "authorizations": [],
            }
        grouped[prs]["authorizations"].append(_display_authorization(row))
        grouped[prs]["count"] += 1
    return {
        "ok": True,
        "data": list(grouped.values()),
        "total": total,
        "page": page,
        "limit": limit,
    }


def get_authorization_detail(prs_no: str) -> dict[str, Any]:
    employee = execute_query(
        """
        SELECT TOP 1 PRS_NO, EMP_NAME, EMP_SURNME
        FROM dbo.vw_employee_checkin
        WHERE PRS_NO = :prs_no
        """,
        {"prs_no": prs_no},
    )
    emp_name = prs_no
    if not employee.empty:
        row = _records(employee)[0]
        emp_name = f"{row.get('EMP_NAME') or ''} {row.get('EMP_SURNME') or ''}".strip() or prs_no

    frame = execute_query(
        """
        SELECT
            za.DEPT_CODE,
            MAX(d.DEPT_THAIDESC) AS DEPT_NAME,
            za.BR_CODE,
            MAX(b.BR_THAIDESC) AS BR_NAME
        FROM dbo.ZHR_AUTHORIZATION za
        LEFT JOIN (
            SELECT DISTINCT DEPT_CODE, DEPT_THAIDESC
            FROM dbo.vw_employee_checkin
        ) d ON za.DEPT_CODE = d.DEPT_CODE
        LEFT JOIN (
            SELECT DISTINCT BR_CODE, BR_THAIDESC
            FROM dbo.vw_employee_checkin
            WHERE BR_CODE IS NOT NULL
        ) b ON za.BR_CODE = b.BR_CODE
        WHERE za.PRS_NO = :prs_no
        GROUP BY za.DEPT_CODE, za.BR_CODE
        ORDER BY za.DEPT_CODE, za.BR_CODE
        """,
        {"prs_no": prs_no},
    )
    authorizations = [_display_authorization(row) for row in _records(frame)]
    return {
        "ok": True,
        "data": {
            "prsNo": prs_no,
            "empName": emp_name,
            "count": len(authorizations),
            "authorizations": authorizations,
        },
    }


def get_authorization_tree() -> dict[str, Any]:
    departments = _records(
        execute_query(
            """
            SELECT DISTINCT DEPT_CODE, DEPT_THAIDESC
            FROM dbo.vw_employee_checkin
            WHERE DEPT_CODE IS NOT NULL
            ORDER BY DEPT_CODE
            """
        )
    )
    branches = _records(
        execute_query(
            """
            SELECT DISTINCT BR_CODE, BR_THAIDESC
            FROM dbo.vw_employee_checkin
            WHERE BR_CODE IS NOT NULL
            ORDER BY BR_CODE
            """
        )
    )
    authorizations = _records(
        execute_query(
            """
            SELECT
                za.PRS_NO,
                MAX(e.EMP_NAME) + ' ' + MAX(e.EMP_SURNME) AS EMP_FULLNAME,
                za.DEPT_CODE,
                za.BR_CODE
            FROM dbo.ZHR_AUTHORIZATION za
            LEFT JOIN (
                SELECT DISTINCT PRS_NO, EMP_NAME, EMP_SURNME
                FROM dbo.vw_employee_checkin
            ) e ON za.PRS_NO = e.PRS_NO
            GROUP BY za.PRS_NO, za.DEPT_CODE, za.BR_CODE
            """
        )
    )

    result: list[dict[str, Any]] = []
    all_employees = [
        {"prsNo": row["PRS_NO"], "empName": row.get("EMP_FULLNAME") or row["PRS_NO"]}
        for row in authorizations
        if (row.get("DEPT_CODE") or "ALL") == "ALL"
        and (row.get("BR_CODE") or "ALL") == "ALL"
    ]
    if all_employees:
        result.append(
            {
                "code": "ALL",
                "name": "ทุกแผนก",
                "branches": [
                    {"code": "ALL", "name": "ทุกสาขา", "employees": all_employees}
                ],
            }
        )

    for dept in departments:
        dept_code = dept["DEPT_CODE"]
        dept_branches = []
        for branch in branches:
            branch_code = branch["BR_CODE"]
            employees = [
                {
                    "prsNo": row["PRS_NO"],
                    "empName": row.get("EMP_FULLNAME") or row["PRS_NO"],
                }
                for row in authorizations
                if row.get("DEPT_CODE") == dept_code
                and row.get("BR_CODE") in {branch_code, "ALL"}
            ]
            if employees:
                dept_branches.append(
                    {
                        "code": branch_code,
                        "name": branch.get("BR_THAIDESC") or branch_code,
                        "employees": employees,
                    }
                )
        if dept_branches:
            result.append(
                {
                    "code": dept_code,
                    "name": dept.get("DEPT_THAIDESC") or dept_code,
                    "branches": dept_branches,
                }
            )
    return {"ok": True, "data": {"departments": result}}


def _try_audit(sql: str, params: dict[str, Any]) -> None:
    try:
        engine = get_engine()
        with engine.begin() as conn:
            conn.execute(text(sql), params)
    except Exception:
        # Audit support is optional during rollout; never undo the primary write.
        pass


def create_authorization(
    prs_no: str, dept_code: str, br_code: Optional[str], changed_by: str
) -> dict[str, Any]:
    branch = _nullable_branch(br_code)
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO dbo.ZHR_AUTHORIZATION (PRS_NO, DEPT_CODE, BR_CODE)
                VALUES (:prs_no, :dept_code, :br_code)
                """
            ),
            {"prs_no": prs_no, "dept_code": dept_code, "br_code": branch},
        )
    _try_audit(
        """
        INSERT INTO dbo.ZHR_AUTHORIZATION_AUDIT
            (PRS_NO, DEPT_CODE, BR_CODE, ACTION, CHANGED_BY, CHANGED_DATE)
        VALUES (:prs_no, :dept_code, :br_code, 'INSERT', :changed_by, GETDATE())
        """,
        {
            "prs_no": prs_no,
            "dept_code": dept_code,
            "br_code": branch,
            "changed_by": changed_by,
        },
    )
    return {"ok": True, "message": "Authorization created successfully"}


def update_authorization(
    prs_no: str,
    old_dept_code: Optional[str],
    old_br_code: Optional[str],
    dept_code: str,
    br_code: Optional[str],
    changed_by: str,
) -> dict[str, Any]:
    old_dept = str(old_dept_code or "").strip()
    old_branch = _nullable_branch(old_br_code)
    branch = _nullable_branch(br_code)
    if not old_dept:
        old_frame = execute_query(
            """
            SELECT DEPT_CODE, BR_CODE
            FROM dbo.ZHR_AUTHORIZATION
            WHERE PRS_NO = :prs_no
              AND DEPT_CODE = :dept_code
              AND (BR_CODE = :br_code OR (BR_CODE IS NULL AND :br_code IS NULL))
            """,
            {"prs_no": prs_no, "dept_code": dept_code, "br_code": branch},
        )
        if not old_frame.empty:
            old = _records(old_frame)[0]
            old_dept = str(old.get("DEPT_CODE") or "")
            old_branch = old.get("BR_CODE")

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE dbo.ZHR_AUTHORIZATION
                SET DEPT_CODE = :dept_code, BR_CODE = :br_code
                WHERE PRS_NO = :prs_no
                  AND DEPT_CODE = :old_dept_code
                  AND (
                      BR_CODE = :old_br_code
                      OR (BR_CODE IS NULL AND :old_br_code IS NULL)
                  )
                """
            ),
            {
                "prs_no": prs_no,
                "old_dept_code": old_dept,
                "old_br_code": old_branch,
                "dept_code": dept_code,
                "br_code": branch,
            },
        )
    _try_audit(
        """
        INSERT INTO dbo.ZHR_AUTHORIZATION_AUDIT
            (
                PRS_NO, DEPT_CODE, BR_CODE, ACTION,
                OLD_DEPT_CODE, OLD_BR_CODE, CHANGED_BY, CHANGED_DATE
            )
        VALUES (
            :prs_no, :dept_code, :br_code, 'UPDATE',
            :old_dept_code, :old_br_code, :changed_by, GETDATE()
        )
        """,
        {
            "prs_no": prs_no,
            "dept_code": dept_code,
            "br_code": branch,
            "old_dept_code": old_dept,
            "old_br_code": old_branch,
            "changed_by": changed_by,
        },
    )
    return {"ok": True, "message": "Authorization updated successfully"}


def delete_authorization(
    prs_no: str, dept_code: str, br_code: Optional[str], changed_by: str
) -> Optional[dict[str, Any]]:
    branch = _nullable_branch(br_code)
    old_frame = execute_query(
        """
        SELECT DEPT_CODE, BR_CODE
        FROM dbo.ZHR_AUTHORIZATION
        WHERE PRS_NO = :prs_no
          AND DEPT_CODE = :dept_code
          AND (BR_CODE = :br_code OR (BR_CODE IS NULL AND :br_code IS NULL))
        """,
        {"prs_no": prs_no, "dept_code": dept_code, "br_code": branch},
    )
    if old_frame.empty:
        return None
    old = _records(old_frame)[0]
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                DELETE FROM dbo.ZHR_AUTHORIZATION
                WHERE PRS_NO = :prs_no
                  AND DEPT_CODE = :dept_code
                  AND (BR_CODE = :br_code OR (BR_CODE IS NULL AND :br_code IS NULL))
                """
            ),
            {"prs_no": prs_no, "dept_code": dept_code, "br_code": branch},
        )
    _try_audit(
        """
        INSERT INTO dbo.ZHR_AUTHORIZATION_AUDIT
            (
                PRS_NO, DEPT_CODE, BR_CODE, ACTION,
                OLD_DEPT_CODE, OLD_BR_CODE, CHANGED_BY, CHANGED_DATE
            )
        VALUES (
            :prs_no, :dept_code, :br_code, 'DELETE',
            :old_dept_code, :old_br_code, :changed_by, GETDATE()
        )
        """,
        {
            "prs_no": prs_no,
            "dept_code": old.get("DEPT_CODE"),
            "br_code": old.get("BR_CODE"),
            "old_dept_code": old.get("DEPT_CODE"),
            "old_br_code": old.get("BR_CODE"),
            "changed_by": changed_by,
        },
    )
    return {"ok": True, "message": "Authorization deleted successfully"}


def list_audit_logs(
    prs_no: Optional[str] = None,
    date_from: Optional[date | datetime | str] = None,
    date_to: Optional[date | datetime | str] = None,
    action: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> dict[str, Any]:
    where = ["1 = 1"]
    params: dict[str, Any] = {}
    for value, clause, key in (
        (prs_no, "za.PRS_NO = :prs_no", "prs_no"),
        (date_from, "za.CHANGED_DATE >= :date_from", "date_from"),
        (date_to, "za.CHANGED_DATE <= :date_to", "date_to"),
        (action, "za.ACTION = :action", "action"),
    ):
        if value:
            where.append(clause)
            params[key] = value
    where_sql = " AND ".join(where)
    count_frame = execute_query(
        f"""
        SELECT COUNT(*) AS total
        FROM dbo.ZHR_AUTHORIZATION_AUDIT za
        WHERE {where_sql}
        """,
        params,
    )
    total = int(count_frame.iloc[0]["total"]) if not count_frame.empty else 0
    frame = execute_query(
        f"""
        SELECT
            za.AUDIT_ID,
            za.PRS_NO,
            za.ACTION,
            za.DEPT_CODE,
            za.BR_CODE,
            za.OLD_DEPT_CODE,
            za.OLD_BR_CODE,
            za.CHANGED_BY,
            za.CHANGED_DATE,
            e.EMP_NAME + ' ' + e.EMP_SURNME AS CHANGED_BY_NAME
        FROM dbo.ZHR_AUTHORIZATION_AUDIT za
        LEFT JOIN (
            SELECT DISTINCT PRS_NO, EMP_NAME, EMP_SURNME
            FROM dbo.vw_employee_checkin
        ) e ON za.CHANGED_BY = e.PRS_NO
        WHERE {where_sql}
        ORDER BY za.CHANGED_DATE DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        """,
        {**params, "offset": (page - 1) * limit, "limit": limit},
    )
    return {
        "ok": True,
        "data": _records(frame),
        "total": total,
        "page": page,
        "limit": limit,
    }


def list_employees(search: Optional[str] = None) -> dict[str, Any]:
    params: dict[str, Any] = {}
    search_sql = ""
    if search:
        search_sql = """
          AND (PRS_NO LIKE :search OR EMP_NAME LIKE :search OR EMP_SURNME LIKE :search)
        """
        params["search"] = f"%{search}%"
    rows = _records(
        execute_query(
            f"""
            SELECT DISTINCT PRS_NO, EMP_NAME, EMP_SURNME
            FROM dbo.vw_employee_checkin
            WHERE PRS_NO IS NOT NULL
            {search_sql}
            ORDER BY PRS_NO
            """,
            params,
        )
    )
    return {
        "ok": True,
        "data": [
            {
                "prsNo": row["PRS_NO"],
                "name": f"{row.get('EMP_NAME') or ''} {row.get('EMP_SURNME') or ''}".strip(),
            }
            for row in rows
        ],
    }


def list_departments() -> dict[str, Any]:
    rows = _records(
        execute_query(
            """
            SELECT DISTINCT DEPT_CODE, DEPT_THAIDESC
            FROM dbo.vw_employee_checkin
            WHERE DEPT_CODE IS NOT NULL
            ORDER BY DEPT_CODE
            """
        )
    )
    return {
        "ok": True,
        "data": [
            {
                "code": row["DEPT_CODE"],
                "name": row.get("DEPT_THAIDESC") or row["DEPT_CODE"],
            }
            for row in rows
        ],
    }


def list_branches(dept_code: Optional[str] = None) -> dict[str, Any]:
    params: dict[str, Any] = {}
    dept_sql = ""
    if dept_code:
        dept_sql = "AND DEPT_CODE = :dept_code"
        params["dept_code"] = dept_code
    rows = _records(
        execute_query(
            f"""
            SELECT DISTINCT BR_CODE, BR_THAIDESC
            FROM dbo.vw_employee_checkin
            WHERE BR_CODE IS NOT NULL
            {dept_sql}
            ORDER BY BR_CODE
            """,
            params,
        )
    )
    return {
        "ok": True,
        "data": [
            {
                "code": row["BR_CODE"],
                "name": row.get("BR_THAIDESC") or row["BR_CODE"],
            }
            for row in rows
        ],
    }
