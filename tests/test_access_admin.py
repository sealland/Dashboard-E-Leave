from __future__ import annotations

import unittest
from unittest.mock import patch

import pandas as pd


class AccessAdminTests(unittest.TestCase):
    def test_add_user_access_creates_scope_and_report(self):
        from app import report_acl

        with patch.object(report_acl, "_scope_exists", return_value=False), patch(
            "app.zhr_auth_admin.create_authorization"
        ) as create_scope, patch.object(
            report_acl,
            "add_report_acl",
            return_value={"report_code": "e-leave", "report_label": "Dashboard E-Leave"},
        ) as add_report, patch("app.zhr_auth_admin._nullable_branch", side_effect=lambda value: value):
            result = report_acl.add_user_access(
                prs_no="67050023",
                dept_code="ALL",
                br_code="ALL",
                report_code="e-leave",
                changed_by="57110047",
            )

        create_scope.assert_called_once_with(
            prs_no="67050023",
            dept_code="ALL",
            br_code="ALL",
            changed_by="57110047",
        )
        add_report.assert_called_once_with("67050023", "e-leave")
        self.assertTrue(result["scope_created"])
        self.assertEqual(result["report_code"], "e-leave")

    def test_add_user_access_skips_existing_scope(self):
        from app import report_acl

        with patch.object(report_acl, "_scope_exists", return_value=True), patch(
            "app.zhr_auth_admin.create_authorization"
        ) as create_scope, patch.object(
            report_acl,
            "add_report_acl",
            return_value={"report_code": "ALL", "report_label": "ทุกรายงาน (ALL)"},
        ), patch("app.zhr_auth_admin._nullable_branch", side_effect=lambda value: value):
            result = report_acl.add_user_access(
                prs_no="67050023",
                dept_code="ALL",
                br_code="ALL",
                report_code="ALL",
                changed_by="57110047",
            )

        create_scope.assert_not_called()
        self.assertFalse(result["scope_created"])

    def test_scope_exists_handles_null_branch(self):
        from app import report_acl

        frame = pd.DataFrame([{"ok": 1}])
        with patch("app.zhr_auth_admin._nullable_branch", return_value=None), patch.object(
            report_acl, "execute_query", return_value=frame
        ) as query:
            exists = report_acl._scope_exists("67050023", "IT", None)

        self.assertTrue(exists)
        sql = query.call_args[0][0]
        self.assertIn("BR_CODE IS NULL", sql)


if __name__ == "__main__":
    unittest.main()
