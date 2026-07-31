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


def get_authorization(prs_no: Optional[str]) -> Authorization:
    """Load auth scope for PRS_NO. Empty prs_no = deny (ต้องระบุ ?c=)."""
    code = str(prs_no or "").strip()
    if not code:
        return Authorization(prs_no="")

    df = execute_query(
        """
        SELECT DEPT_CODE, BR_CODE
        FROM dbo.ZHR_AUTHORIZATION
        WHERE PRS_NO = :prs_no
        """,
        {"prs_no": code},
    )

    auth = Authorization(prs_no=code)
    if df.empty:
        return auth

    dept_seen: set[str] = set()
    branch_seen: set[str] = set()
    for row in df.to_dict(orient="records"):
        dept = str(row.get("DEPT_CODE") or "").strip()
        branch = str(row.get("BR_CODE") or "").strip()
        if dept:
            if dept.upper() == "ALL":
                auth.has_all_dept = True
            elif dept not in dept_seen:
                dept_seen.add(dept)
                auth.departments.append(dept)
        if branch:
            if branch.upper() == "ALL":
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
