from __future__ import annotations

import unittest

from app.auth import Authorization, can_see_dashboard, REPORT_EMC


def _auth(**kwargs) -> Authorization:
    defaults = {
        "prs_no": "67050023",
        "has_all_dept": True,
        "has_all_branch": False,
        "has_all_reports": False,
        "reports": [REPORT_EMC],
        "departments": [],
        "branches": [],
    }
    defaults.update(kwargs)
    auth = Authorization(prs_no=defaults.pop("prs_no"))
    for key, value in defaults.items():
        setattr(auth, key, value)
    return auth


class CanSeeDashboardTests(unittest.TestCase):
    def test_emc_visible_when_explicitly_granted_without_all_scope(self):
        auth = _auth(has_all_branch=False, has_all_dept=True)
        self.assertFalse(auth.is_all_scope)
        self.assertTrue(can_see_dashboard(auth, REPORT_EMC, hidden_default=True))

    def test_emc_hidden_for_legacy_all_reports_without_all_scope(self):
        auth = _auth(has_all_branch=False, has_all_reports=True, reports=list())
        self.assertFalse(can_see_dashboard(auth, REPORT_EMC, hidden_default=True))

    def test_emc_visible_for_all_scope_with_legacy_all_reports(self):
        auth = _auth(has_all_branch=True, has_all_reports=True, reports=list())
        self.assertTrue(auth.is_all_scope)
        self.assertTrue(can_see_dashboard(auth, REPORT_EMC, hidden_default=True))

    def test_public_landing_hides_hidden_modules_without_auth(self):
        self.assertFalse(can_see_dashboard(None, REPORT_EMC, hidden_default=True))
        self.assertTrue(can_see_dashboard(None, "e-leave", hidden_default=False))


if __name__ == "__main__":
    unittest.main()
