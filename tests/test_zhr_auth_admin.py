from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import pandas as pd


class ZhrAuthAdminTests(unittest.TestCase):
    def test_list_authorizations_matches_legacy_grouped_shape(self):
        from app import zhr_auth_admin

        count = pd.DataFrame([{"total": 2}])
        rows = pd.DataFrame(
            [
                {
                    "PRS_NO": "1001",
                    "EMP_FULLNAME": "Ada Lovelace",
                    "DEPT_CODE": "ALL",
                    "DEPT_NAME": None,
                    "BR_CODE": "ALL",
                    "BR_NAME": None,
                },
                {
                    "PRS_NO": "1001",
                    "EMP_FULLNAME": "Ada Lovelace",
                    "DEPT_CODE": "IT",
                    "DEPT_NAME": "Information Technology",
                    "BR_CODE": None,
                    "BR_NAME": None,
                },
            ]
        )
        with patch.object(zhr_auth_admin, "execute_query", side_effect=[count, rows]):
            result = zhr_auth_admin.list_authorizations(page=1, limit=50)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["data"][0]["prsNo"], "1001")
        self.assertEqual(result["data"][0]["count"], 2)
        self.assertEqual(result["data"][0]["authorizations"][0]["deptName"], "ทุกแผนก")
        self.assertEqual(result["data"][0]["authorizations"][1]["brName"], "-")

    def test_create_succeeds_when_optional_audit_insert_fails(self):
        from app import zhr_auth_admin

        connection = MagicMock()
        connection.execute.side_effect = [MagicMock(), RuntimeError("missing audit table")]
        transaction = MagicMock()
        transaction.__enter__.return_value = connection
        engine = MagicMock()
        engine.begin.return_value = transaction

        with patch.object(zhr_auth_admin, "get_engine", return_value=engine):
            result = zhr_auth_admin.create_authorization(
                prs_no="1001",
                dept_code="ALL",
                br_code="ALL",
                changed_by="9000",
            )

        self.assertEqual(
            result,
            {"ok": True, "message": "Authorization created successfully"},
        )
        self.assertEqual(connection.execute.call_count, 2)

    def test_required_admin_routes_are_registered(self):
        from app.main import app

        registered = {
            (method, route.path)
            for route in app.routes
            for method in (getattr(route, "methods", None) or [])
        }
        expected = {
            ("GET", "/api/admin/zhr-auth/authorizations"),
            ("GET", "/api/admin/zhr-auth/authorizations/{prs_no}"),
            ("GET", "/api/admin/zhr-auth/authorizations/tree"),
            ("POST", "/api/admin/zhr-auth/authorizations"),
            ("PUT", "/api/admin/zhr-auth/authorizations"),
            ("DELETE", "/api/admin/zhr-auth/authorizations"),
            ("GET", "/api/admin/zhr-auth/audit-logs"),
            ("GET", "/api/admin/zhr-auth/employees"),
            ("GET", "/api/admin/zhr-auth/departments"),
            ("GET", "/api/admin/zhr-auth/branches"),
        }
        self.assertTrue(expected.issubset(registered))


if __name__ == "__main__":
    unittest.main()
