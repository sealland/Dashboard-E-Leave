"""Authorization from dbo.ZHR_AUTHORIZATION (PRS_NO → DEPT_CODE / BR_CODE)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from db.connection import execute_query


@dataclass
class Authorization:
    prs_no: str
    departments: list[str] = field(default_factory=list)
    branches: list[str] = field(default_factory=list)
    has_all_dept: bool = False
    has_all_branch: bool = False

    @property
    def active(self) -> bool:
        return bool(self.prs_no)

    @property
    def allowed(self) -> bool:
        if not self.active:
            return False
        if self.has_all_dept:
            return True
        return len(self.departments) > 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "prs_no": self.prs_no or None,
            "departments": self.departments,
            "branches": self.branches,
            # Reserved for EMC person-level allow-list (future)
            "employees": [],
            "has_all_dept": self.has_all_dept,
            "has_all_branch": self.has_all_branch,
            "active": self.active,
            "allowed": self.allowed,
            "message": (
                None
                if self.allowed
                else (
                    "ไม่พบสิทธิ์ — กรุณาระบุรหัสพนักงาน (?c=PRS_NO)"
                    if not self.active
                    else f"ไม่พบสิทธิ์ใน ZHR_AUTHORIZATION สำหรับ {self.prs_no}"
                )
            ),
        }


def _cell(row: dict[str, Any], *names: str) -> str:
    lower_map = {str(key).lower(): value for key, value in row.items()}
    for name in names:
        value = row.get(name)
        if value is None:
            value = lower_map.get(name.lower())
        if value is None:
            continue
        text = str(value).strip()
        if text.lower() in {"", "none", "nan"}:
            continue
        # Avoid float artifacts like 56070033.0 from numeric columns
        if text.endswith(".0") and text.replace(".", "", 1).isdigit():
            text = text[:-2]
        return text
    return ""


def _is_all(value: str) -> bool:
    return value.upper() == "ALL"


def get_authorization(prs_no: Optional[str]) -> Authorization:
    """Load auth scope for PRS_NO. Empty prs_no = deny (ต้องระบุ ?c=)."""
    code = str(prs_no or "").strip()
    if not code:
        return Authorization(prs_no="")

    df = execute_query(
        """
        SELECT
            LTRIM(RTRIM(CAST(DEPT_CODE AS NVARCHAR(100)))) AS DEPT_CODE,
            LTRIM(RTRIM(CAST(BR_CODE AS NVARCHAR(100)))) AS BR_CODE,
            LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) AS PRS_NO
        FROM dbo.ZHR_AUTHORIZATION
        WHERE LTRIM(RTRIM(CAST(PRS_NO AS NVARCHAR(50)))) = :prs_no
           OR (
                TRY_CAST(PRS_NO AS BIGINT) IS NOT NULL
                AND TRY_CAST(:prs_no_num AS BIGINT) IS NOT NULL
                AND TRY_CAST(PRS_NO AS BIGINT) = TRY_CAST(:prs_no_num AS BIGINT)
           )
        """,
        {"prs_no": code, "prs_no_num": code},
    )

    auth = Authorization(prs_no=code)
    if df.empty:
        return auth

    dept_seen: set[str] = set()
    branch_seen: set[str] = set()
    for row in df.to_dict(orient="records"):
        dept = _cell(row, "DEPT_CODE", "dept_code")
        branch = _cell(row, "BR_CODE", "br_code")
        if dept:
            if _is_all(dept):
                auth.has_all_dept = True
            elif dept not in dept_seen:
                dept_seen.add(dept)
                auth.departments.append(dept)
        if branch:
            if _is_all(branch):
                auth.has_all_branch = True
            elif branch not in branch_seen:
                branch_seen.add(branch)
                auth.branches.append(branch)

    return auth


def apply_auth_dept_sql(
    sql: str,
    params: dict[str, Any],
    auth: Optional[Authorization],
) -> tuple[str, dict[str, Any]]:
    """Restrict DEPT_CODE by authorization. Blocks when missing ?c= or no rights."""
    if not auth or not auth.active:
        sql += " AND 1 = 0"
        return sql, params
    if auth.has_all_dept:
        return sql, params
    if not auth.departments:
        sql += " AND 1 = 0"
        return sql, params

    placeholders = []
    for index, dept in enumerate(auth.departments):
        key = f"auth_dept_{index}"
        placeholders.append(f":{key}")
        params[key] = dept
    sql += f" AND DEPT_CODE IN ({', '.join(placeholders)})"
    return sql, params
