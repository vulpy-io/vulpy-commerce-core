"""Unit tests for scripts/patch-webui-global-approval-banner.py (issue #136 v2).

Pattern mirrors tests/test_patch_ui.py: drive the patcher as a subprocess
against a throwaway static/messages.js fixture, then assert markers/exit codes.

  - fresh file -> merged machinery injected (v2 markers, no v1 leftovers)
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - v1-patched file -> upgraded: v1 machinery + v1 hook stripped, v2 applied
  - mutated anchor -> exit 1, fail-loud error names the missing anchor

The fresh fixture is built from the patcher's OWN anchors so the test stays
correct when they drift. The v1-patched fixture is a committed snapshot of
the exact text the v1 patcher wrote (tests/fixtures/global-approval-banner-v1-patched.js).
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-global-approval-banner.py"
V1_FIXTURE = ROOT / "tests" / "fixtures" / "global-approval-banner-v1-patched.js"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_global_banner_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiGlobalApprovalBannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        messages = Path(temporary.name) / "messages.js"
        messages.write_text(
            self.patcher.OLD + "\n\n" + self.patcher.HOOK_OLD + "\n",
            encoding="utf-8",
        )
        return temporary, messages

    def _run(self, messages):
        return subprocess.run(
            ["python3", str(PATCHER), str(messages)],
            capture_output=True,
            text=True,
        )

    def test_fresh_file_patches_merged_machinery(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = messages.read_text(encoding="utf-8")
        self.assertIn(self.patcher.NEW_MARK, text)
        self.assertIn("function _showGlobalApprovalBanner", text)
        self.assertIn("function dismissGlobalApprovalBanner", text)
        self.assertIn("function respondGlobalApproval", text)
        self.assertIn("function _startMergedApprovalPoll", text)
        self.assertIn("function _mergedApprovalPollTick", text)
        self.assertIn("_globalApprovalSetBusy", text)
        # v3: always-visible compact indicator + origin + deny-reason input.
        self.assertIn("function _updateApprovalIndicator", text)
        self.assertIn("vulpyApprovalIndicator", text)
        self.assertIn("vulpy-global-approval-origin", text)
        self.assertIn("approval-reason-input", text)
        # startApprovalPolling now starts the merged poll, not the v1 poll.
        self.assertIn("_startMergedApprovalPoll(sid);", text)
        self.assertNotIn("_startGlobalApprovalPoll();", text)
        # The upstream per-session fallback poll call is replaced.
        self.assertNotIn(self.patcher.HOOK_OLD, text)
        # The banner is hosted inside the composer flyout (not document.body).
        self.assertIn("#composerWrap .composer-flyout", text)

    def test_rerun_is_idempotent(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)

        first = self._run(messages)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = messages.read_text(encoding="utf-8")

        second = self._run(messages)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(messages.read_text(encoding="utf-8"), first_text)

    def test_v1_patched_file_upgrades_in_place(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        messages = Path(temporary.name) / "messages.js"
        messages.write_text(V1_FIXTURE.read_text(encoding="utf-8"), encoding="utf-8")

        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("upgraded", result.stdout)

        text = messages.read_text(encoding="utf-8")
        # v1 machinery stripped: the old tick + old hook are gone.
        self.assertNotIn("_globalApprovalPollTick", text)
        self.assertNotIn("_startGlobalApprovalPoll();", text)
        self.assertNotIn("_globalApprovalPollTimer", text)
        # v2 machinery present exactly once (marker = comment + class name).
        self.assertEqual(text.count(self.patcher.NEW_MARK), 1)
        self.assertIn("function _startMergedApprovalPoll", text)
        # The upstream anchor function survived untouched.
        self.assertIn("function showApprovalForSession", text)

    def test_v1_patched_file_rerun_is_idempotent(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        messages = Path(temporary.name) / "messages.js"
        messages.write_text(V1_FIXTURE.read_text(encoding="utf-8"), encoding="utf-8")

        first = self._run(messages)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = messages.read_text(encoding="utf-8")

        second = self._run(messages)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(messages.read_text(encoding="utf-8"), first_text)

    def test_v1_patched_underscore_variant_upgrades_in_place(self):
        """A v1 file whose per-session helper carried an underscore prefix
        (e.g. an old v1 patcher that anchored `_showApprovalForSession`) must
        still upgrade cleanly: the underscore name is normalized to the
        canonical name before the v2 machinery is injected.
        """
        underscore = ROOT / "tests" / "fixtures" / "global-approval-banner-v1-patched-underscore.js"
        self.assertTrue(underscore.exists(), "underscore fixture missing")

        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        messages = Path(temporary.name) / "messages.js"
        messages.write_text(underscore.read_text(encoding="utf-8"), encoding="utf-8")

        result = self._run(messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("upgraded", result.stdout)

        text = messages.read_text(encoding="utf-8")
        # v1 leftover underscore anchor is gone.
        self.assertNotIn("function _showApprovalForSession", text)
        # canonical anchor function present exactly once.
        self.assertIn("function showApprovalForSession", text)
        # v2 machinery present.
        self.assertEqual(text.count(self.patcher.NEW_MARK), 1)
        self.assertIn("function _startMergedApprovalPoll", text)

    def test_both_anchor_forms_fail_loudly(self):
        """If both the canonical and underscore helper names are present, the
        patcher must refuse rather than guess which one to anchor on."""
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        underscore_anchor = self.patcher.ANCHOR.replace(
            "function showApprovalForSession",
            "function _showApprovalForSession",
            1,
        )
        # If the underscore constant is defined use it, else derive by rename.
        if hasattr(self.patcher, "ANCHOR_UNDERSCORE"):
            underscore_anchor = self.patcher.ANCHOR_UNDERSCORE
        text = (
            self.patcher.ANCHOR + "\n" + underscore_anchor + "\n" + self.patcher.HOOK_OLD + "\n"
        )
        messages.write_text(text, encoding="utf-8")
        result = self._run(messages)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("cannot disambiguate", result.stderr + result.stdout)

    def test_mutated_anchor_fails_loudly(self):
        temporary, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        messages.write_text(
            "function showApprovalForSession() {}\n" + self.patcher.HOOK_OLD + "\n",
            encoding="utf-8",
        )
        result = self._run(messages)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    def test_usage_requires_one_arg(self):
        result = subprocess.run(
            ["python3", str(PATCHER)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
