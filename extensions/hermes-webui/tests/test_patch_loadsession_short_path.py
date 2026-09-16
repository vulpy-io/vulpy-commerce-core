"""Unit tests for scripts/patch-webui-loadsession-short-path.py.

Pattern mirrors tests/test_patch_webui_global_approval_banner.py: drive the
patcher as a subprocess against a throwaway sessions.js fixture, then assert
markers/exit codes.

  - fresh file -> short-path dispatch + helper function injected, idempotency
    mark appears in output
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated anchor (dispatch) -> exit 1, fail-loud error names the missing anchor
  - mutated anchor (func declaration) -> exit 1, fail-loud
  - wrong arg count -> exit 1, Usage printed to stderr
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-loadsession-short-path.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_loadsession_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiLoadSessionShortPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixture(self) -> tuple:
        """Return (tmpdir, sessions_js_path) with a minimal fixture containing both anchors."""
        tmp = tempfile.TemporaryDirectory()
        path = Path(tmp.name) / "sessions.js"
        # Build minimal fixture from the patcher's own anchor constants so the
        # test stays correct when anchors change.
        path.write_text(
            self.patcher.FUNC_ANCHOR  # async function loadSession(sid){\n
            + "  const opts = arguments[1] || {};\n"
            + self.patcher.ANCHOR     # the lineage-resolve block
            + "  // rest of loadSession body\n"
            + "}\n",
            encoding="utf-8",
        )
        return tmp, path

    def _run(self, path):
        return subprocess.run(
            ["python3", str(PATCHER), str(path)],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh file → patches applied
    # ------------------------------------------------------------------
    def test_fresh_file_patches_dispatch_and_helper(self):
        tmp, path = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        result = self._run(path)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = path.read_text(encoding="utf-8")
        # Idempotency mark present (both in dispatch comment and helper)
        self.assertGreaterEqual(text.count(self.patcher.IDEMPOTENCY_MARK), 1)
        # Helper function injected
        self.assertIn("async function loadSessionPaneShortPath(", text)
        # Dispatch block injected inside loadSession
        self.assertIn("return loadSessionPaneShortPath(sid", text)
        # Original loadSession body still present
        self.assertIn("async function loadSession(sid){", text)
        # The helper appears BEFORE loadSession in the file
        helper_pos = text.index("async function loadSessionPaneShortPath(")
        full_pos = text.index("async function loadSession(sid){")
        self.assertLess(helper_pos, full_pos)
        # Stream-leak teardown (2026-08-16): the helper must close the previous
        # session's per-turn chat stream and clear stale global stream state.
        self.assertIn("closeOtherLiveStreams(sid)", text)
        self.assertIn("_newPaneHasLiveStream", text)
        self.assertIn("S.activeStreamId = null", text)
        self.assertIn("S.busy = false", text)

    # ------------------------------------------------------------------
    # Idempotency: second run is a no-op
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        tmp, path = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        first = self._run(path)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = path.read_text(encoding="utf-8")

        second = self._run(path)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        # File not modified on second run
        self.assertEqual(path.read_text(encoding="utf-8"), first_text)

    # ------------------------------------------------------------------
    # Mutated dispatch anchor → fail-loud
    # ------------------------------------------------------------------
    def test_mutated_dispatch_anchor_fails_loudly(self):
        tmp, path = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        # Write a file that has the func-declaration anchor but NOT the
        # lineage-resolve ANCHOR block.
        path.write_text(
            self.patcher.FUNC_ANCHOR
            + "  const opts = arguments[1] || {};\n"
            + "  // lineage resolve block intentionally removed\n"
            + "  const forceReload = !!opts.force;\n"
            + "}\n",
            encoding="utf-8",
        )
        result = self._run(path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    # ------------------------------------------------------------------
    # Mutated func-declaration anchor → fail-loud
    # ------------------------------------------------------------------
    def test_mutated_func_anchor_fails_loudly(self):
        tmp, path = self._make_fixture()
        self.addCleanup(tmp.cleanup)
        # File has the ANCHOR block but the function declaration is renamed.
        path.write_text(
            "async function loadSessionRenamed(sid){\n"
            + "  const opts = arguments[1] || {};\n"
            + self.patcher.ANCHOR
            + "}\n",
            encoding="utf-8",
        )
        result = self._run(path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor", result.stderr + result.stdout)

    # ------------------------------------------------------------------
    # Wrong argument count → usage + exit 1
    # ------------------------------------------------------------------
    def test_usage_requires_one_arg(self):
        result = subprocess.run(
            ["python3", str(PATCHER)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)

    def test_usage_too_many_args(self):
        result = subprocess.run(
            ["python3", str(PATCHER), "a.js", "b.js"],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
