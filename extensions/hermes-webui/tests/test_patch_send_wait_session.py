"""Unit tests for scripts/patch-webui-send-wait-session.py.

Pattern mirrors tests/test_patch_loadsession_short_path.py: drive the
patcher as a subprocess against a throwaway messages.js fixture, then assert
markers/exit codes.

  - fresh file -> helper + guarded fallback injected, idempotency mark present
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated send() declaration anchor -> exit 1, fail-loud error
  - mutated newSession fallback anchor -> exit 1, fail-loud error
  - wrong arg count -> exit 1, Usage printed to stderr
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-send-wait-session.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_send_wait_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SEND_ANCHOR = "async function send(){"


def _make_multi_fallback_fixture(path: Path) -> None:
    """Faithful pre-patch messages.js send(): multiple deeper-indented
    `if(!S.session){await newSession();await renderSessionList();}` fallbacks
    (busy branch + slash-command handlers — the same 8-fallback layout found
    in the real upstream messages.js) plus the ONE 2-space main fallback that
    the patch must replace (followed by a blank line + `const activeSid=`)."""
    path.write_text(
        "var S = {};\n"
        "async function send(){\n"
        "  const text=$('msg').value.trim();\n"
        "  if(S.busy){\n"
        "    if(text){\n"
        "      if(!S.session){await newSession();await renderSessionList();}\n"
        "      if(text.startsWith('/')){ return; }\n"
        "    }\n"
        "  }\n"
        "  if(_parsedCmd){\n"
        "    if(!S.session){await newSession();await renderSessionList();}\n"
        "    S.messages.push({role:'user',content:text});\n"
        "    renderMessages();\n"
        "  }\n"
        "  if(!S.session){await newSession();await renderSessionList();}\n"
        "\n"
        "  const activeSid=S.session.session_id;\n"
        "  _sendInProgressSid=activeSid;\n"
        "}\n",
        encoding="utf-8",
    )


def _make_fixture(path: Path) -> None:
    """Minimal messages.js fixture containing both patch anchors."""
    path.write_text(
        "var S = {};\n"
        "async function send(){\n"
        "  if(_sendInProgress){ return; }\n"
        "  const text=$('msg').value.trim();\n"
        "  if(!S.session){await newSession();await renderSessionList();}\n"
        "\n"
        "  const activeSid=S.session.session_id;\n"
        "  _sendInProgressSid=activeSid;\n"
        "}\n",
        encoding="utf-8",
    )


class PatchWebuiSendWaitSessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _run(self, path):
        return subprocess.run(
            ["python3", str(PATCHER), str(path)],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh file -> patches applied
    # ------------------------------------------------------------------
    def test_fresh_file_patches_helper_and_guard(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "messages.js"
        _make_fixture(path)

        result = self._run(path)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = path.read_text(encoding="utf-8")
        # Idempotency mark present
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, text)
        # Helper injected before send()
        self.assertIn("async function _hermesWaitForRestoredSession(){", text)
        helper_pos = text.index("async function _hermesWaitForRestoredSession(){")
        send_pos = text.index(SEND_ANCHOR)
        self.assertLess(helper_pos, send_pos)
        # Guarded fallback present; bare newSession fallback in send() gone
        self.assertIn("const _restoredSid=await _hermesWaitForRestoredSession();", text)
        self.assertNotIn(
            "if(!S.session){await newSession();await renderSessionList();}", text
        )
        # Original send body still present
        self.assertIn("const activeSid=S.session.session_id;", text)
        # The helper polls S.session and honors the saved sid
        self.assertIn("_hermesWaitForRestoredSession", text)
        self.assertIn("S.session.session_id===_target", text)
        self.assertIn("new Promise(r=>setTimeout(r,80))", text)

    # ------------------------------------------------------------------
    # Multi-fallback fixture (faithful to real upstream messages.js) ->
    # ONLY the main 2-space fallback before `const activeSid=` is replaced;
    # deeper-indented slash-command/busy fallbacks keep their behavior.
    # ------------------------------------------------------------------
    def test_multi_fallback_only_main_path_replaced(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "messages.js"
        _make_multi_fallback_fixture(path)

        result = self._run(path)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = path.read_text(encoding="utf-8")
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, text)
        # Guarded main fallback injected (2-space, before const activeSid=)
        self.assertIn("  if(!S.session){\n    const _restoredSid=await _hermesWaitForRestoredSession();", text)
        # Deeper-indented fallbacks survive untouched (raw count drops 3 -> 2)
        self.assertEqual(
            text.count("if(!S.session){await newSession();await renderSessionList();}"),
            2,
        )
        # The replaced main fallback no longer exists as a bare line
        self.assertNotIn(
            "  if(!S.session){await newSession();await renderSessionList();}\n\n  const activeSid=S.session.session_id;",
            text,
        )
        self.assertIn("const activeSid=S.session.session_id;", text)

    # ------------------------------------------------------------------
    # Idempotency: second run is a no-op
    # ------------------------------------------------------------------
    def test_rerun_is_idempotent(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "messages.js"
        _make_fixture(path)

        first = self._run(path)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = path.read_text(encoding="utf-8")

        second = self._run(path)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(path.read_text(encoding="utf-8"), first_text)

    # ------------------------------------------------------------------
    # Mutated send() declaration anchor -> fail-loud
    # ------------------------------------------------------------------
    def test_mutated_send_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "messages.js"
        path.write_text(
            "var S = {};\n"
            "async function sendRenamed(){\n"
            "  if(!S.session){await newSession();await renderSessionList();}\n"
            "}\n",
            encoding="utf-8",
        )

        result = self._run(path)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())
        self.assertIn("drift", result.stderr.lower())

    # ------------------------------------------------------------------
    # Mutated newSession fallback anchor -> fail-loud
    # (fallback content mutated, but the send() structure + activeSid kept)
    # ------------------------------------------------------------------
    def test_mutated_newSession_fallback_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "messages.js"
        path.write_text(
            "var S = {};\n"
            "async function send(){\n"
            "  if(!S.session){await newSession();}\n"  # no renderSessionList
            "\n"
            "  const activeSid=S.session.session_id;\n"
            "}\n",
            encoding="utf-8",
        )

        result = self._run(path)
        self.assertEqual(result.returncode, 1)
        self.assertIn("anchor", result.stderr.lower())

    # ------------------------------------------------------------------
    # Missing main send() structure (no const activeSid) -> fail-loud
    # ------------------------------------------------------------------
    def test_missing_main_send_structure_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "messages.js"
        path.write_text(
            "var S = {};\n"
            "async function send(){\n"
            "  if(!S.session){await newSession();await renderSessionList();}\n"
            "}\n",  # missing the blank line + const activeSid
            encoding="utf-8",
        )

        result = self._run(path)
        self.assertEqual(result.returncode, 1)
        self.assertIn("activesid", result.stderr.lower())

    # ------------------------------------------------------------------
    # Wrong arg count -> exit 1, Usage to stderr
    # ------------------------------------------------------------------
    def test_wrong_arg_count(self):
        result = subprocess.run(
            ["python3", str(PATCHER)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Usage:", result.stderr)


if __name__ == "__main__":
    unittest.main()