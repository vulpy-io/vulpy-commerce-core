"""Unit tests for scripts/patch-webui-stream-switch-leak.py.

Pattern mirrors tests/test_patch_loadsession_short_path.py: drive the patcher
as a subprocess against throwaway messages.js/ui.js fixtures built from the
patcher's own pristine anchor constants, then assert markers/exit codes.

  - fresh files -> all four guards injected, idempotency marks appear
  - re-run on patched files -> exit 0 "already patched", no double-apply
  - mutated anchor -> exit 1, fail-loud error names the missing anchor
  - wrong arg count -> exit 1, Usage printed to stderr
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-stream-switch-leak.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_stream_leak_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiStreamSwitchLeakTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixtures(self) -> tuple:
        """Return (tmpdir, messages_js_path, ui_js_path) with minimal fixtures
        containing the pristine anchors (so the patcher applies exactly once)."""
        tmp = tempfile.TemporaryDirectory()
        messages = Path(tmp.name) / "messages.js"
        messages.write_text(
            "// messages.js fixture\n"
            + self.patcher.ANCHOR_A
            + "\n// middle\n"
            + self.patcher.ANCHOR_B
            + "\n// more\n"
            + self.patcher.ANCHOR_C
            + "  // body continues\n",
            encoding="utf-8",
        )
        ui = Path(tmp.name) / "ui.js"
        ui.write_text(
            "// ui.js fixture\n"
            + "function appendThinking(text='', options){\n"
            + self.patcher.ANCHOR_D
            + "  // body continues\n"
            + "}\n",
            encoding="utf-8",
        )
        return tmp, messages, ui

    def _run(self, messages, ui):
        return subprocess.run(
            ["python3", str(PATCHER), str(messages), str(ui)],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh files -> all guards applied
    # ------------------------------------------------------------------
    def test_fresh_files_patch_all_guards(self):
        tmp, messages, ui = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        result = self._run(messages, ui)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        msg_text = messages.read_text(encoding="utf-8")
        # Idempotency marks present in both files
        self.assertGreaterEqual(msg_text.count(self.patcher.IDEMPOTENCY_MARK), 3)
        self.assertGreaterEqual(ui.read_text(encoding="utf-8").count(self.patcher.IDEMPOTENCY_MARK), 1)
        # Guard A: closeLiveStream stale-global cleanup
        self.assertIn("if(!_isSessionCurrentPane(sessionId)){", msg_text)
        # Guard B: _doRender pane guard
        self.assertIn("if(!_isSessionCurrentPane(activeSid)) return;", msg_text)
        # Guard C: _restoreSettledSession pane guard (before the fetch)
        self.assertLess(
            msg_text.index("// Cross-session guard: the user may have switched panes"),
            msg_text.index("const data=await api(`/api/session?session_id="),
        )
        # Guard D: appendThinking owner guard
        ui_text = ui.read_text(encoding="utf-8")
        self.assertIn("_streamOwnsCurrentPane", ui_text)

    # ------------------------------------------------------------------
    # Idempotency: second run is a no-op
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        tmp, messages, ui = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        first = self._run(messages, ui)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_msg = messages.read_text(encoding="utf-8")
        first_ui = ui.read_text(encoding="utf-8")

        second = self._run(messages, ui)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        # Files not modified on second run
        self.assertEqual(messages.read_text(encoding="utf-8"), first_msg)
        self.assertEqual(ui.read_text(encoding="utf-8"), first_ui)

    # ------------------------------------------------------------------
    # Mutated anchor -> fail-loud
    # ------------------------------------------------------------------
    def test_mutated_messages_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        messages = Path(tmp.name) / "messages.js"
        ui = Path(tmp.name) / "ui.js"
        # messages.js has ANCHOR_A but the _doRender anchor is mutated away.
        messages.write_text(
            "// messages.js fixture\n"
            + self.patcher.ANCHOR_A
            + "\n// Guard: if(_streamFinalized) return; // mutated\n"
            + self.patcher.ANCHOR_C
            + "  // body continues\n",
            encoding="utf-8",
        )
        ui.write_text(
            "// ui.js fixture\n"
            + self.patcher.ANCHOR_D
            + "  // body continues\n",
            encoding="utf-8",
        )
        result = self._run(messages, ui)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    def test_mutated_ui_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        messages = Path(tmp.name) / "messages.js"
        ui = Path(tmp.name) / "ui.js"
        messages.write_text(
            "// messages.js fixture\n"
            + self.patcher.ANCHOR_A
            + "\n"
            + self.patcher.ANCHOR_B
            + "\n"
            + self.patcher.ANCHOR_C
            + "  // body continues\n",
            encoding="utf-8",
        )
        ui.write_text(
            "// ui.js fixture with the appendThinking guard removed\n"
            + "function appendThinking(text='', options){\n"
            + "  options=options||{};\n"
            + "  if(!S.session) return;\n"
            + "}\n",
            encoding="utf-8",
        )
        result = self._run(messages, ui)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    # ------------------------------------------------------------------
    # Wrong argument count -> usage + exit 1
    # ------------------------------------------------------------------
    def test_usage_requires_two_args(self):
        result = subprocess.run(
            ["python3", str(PATCHER), "a.js"],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
