"""Unit tests for scripts/patch-webui-event-bus.py (issue #142).

Pattern mirrors tests/test_patch_webui_global_approval_banner.py: drive the
patcher as a subprocess against throwaway fixtures built from the patcher's
OWN OLD strings, then assert markers/exit codes.

  - fresh files -> bus singleton + all five emit sites injected, exit 0
  - re-run on patched files -> exit 0 "already patched", no double-apply
  - mutated anchors -> exit 1, fail-loud error names the drifted anchor/file
    (ui.js, sessions.js, commands.js, messages.js)
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-event-bus.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_event_bus_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiEventBusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        files = {
            "ui.js": self.patcher.UI_OLD + "\n",
            "sessions.js": self.patcher.SESSIONS_OLD + "\n",
            "commands.js": self.patcher.COMMANDS_OLD + "\n",
            "messages.js": (
                self.patcher.MSGS_OLD_SENT + "\n"
                + self.patcher.MSGS_OLD_START + "\n"
                + self.patcher.MSGS_OLD_DONE + "\n"
                + self.patcher.MSGS_OLD_CANCEL + "\n"
                + self.patcher.MSGS_OLD_ERROR + "\n"
                + self.patcher.MSGS_OLD_WIRE + "\n"
            ),
        }
        for name, text in files.items():
            (root / name).write_text(text, encoding="utf-8")
        return temporary, root

    def _run(self, root):
        return subprocess.run(
            [
                "python3",
                str(PATCHER),
                str(root / "ui.js"),
                str(root / "sessions.js"),
                str(root / "commands.js"),
                str(root / "messages.js"),
            ],
            capture_output=True,
            text=True,
        )

    def test_fresh_files_patch_bus_and_all_emit_sites(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(root)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        ui = (root / "ui.js").read_text(encoding="utf-8")
        self.assertIn("window.HermesBus={", ui)
        self.assertIn("function _hermesBusEmit(type,detail)", ui)
        self.assertEqual(ui.count(self.patcher.MARK_UI), 1)

        sessions = (root / "sessions.js").read_text(encoding="utf-8")
        self.assertIn(
            "_hermesBusEmit('hermes:session-changed'",
            sessions,
        )

        commands = (root / "commands.js").read_text(encoding="utf-8")
        self.assertIn("_hermesBusEmit('hermes:steer-sent'", commands)

        messages = (root / "messages.js").read_text(encoding="utf-8")
        self.assertEqual(messages.count("_hermesBusEmit('hermes:message-sent'"), 1)
        self.assertEqual(messages.count("_hermesBusEmit('hermes:run-started'"), 1)
        # done + cancel + _handleStreamError = 3 terminal emits
        self.assertEqual(messages.count("_hermesBusEmit('hermes:run-completed'"), 3)
        # Stream-event passthrough (2026-08-17): raw /api/chat/stream events
        # forwarded so the pane renders live turns without a duplicate
        # EventSource (connection-pool fix).
        self.assertEqual(messages.count("_hermesBusEmit('hermes:stream-event'"), 1)
        self.assertIn("_vulpyStreamTypes", messages)
        self.assertIn("vulpy-hermes-stream-event", messages)

    def test_rerun_is_idempotent(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)

        first = self._run(root)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        before = {
            name: (root / name).read_text(encoding="utf-8")
            for name in ("ui.js", "sessions.js", "commands.js", "messages.js")
        }

        second = self._run(root)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        # ui + sessions + commands + (messages: five emits + stream block) = 5
        self.assertEqual(second.stdout.count("already patched"), 5)
        after = {
            name: (root / name).read_text(encoding="utf-8")
            for name in ("ui.js", "sessions.js", "commands.js", "messages.js")
        }
        self.assertEqual(after, before)

    def test_old_style_patched_file_gains_stream_block(self):
        """An already-patched messages.js (five emits, pre-2026-08-17) must
        gain the hermes:stream-event passthrough on re-run without duplicating
        the lifecycle emits (upgrade path for live installs)."""
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        # Simulate the old patched state: five emits applied, wire anchor pristine.
        messages_path = root / "messages.js"
        old_style = (
            self.patcher.MSGS_NEW_SENT + "\n"
            + self.patcher.MSGS_NEW_START + "\n"
            + self.patcher.MSGS_NEW_DONE + "\n"
            + self.patcher.MSGS_NEW_CANCEL + "\n"
            + self.patcher.MSGS_NEW_ERROR + "\n"
            + self.patcher.MSGS_OLD_WIRE + "\n"
        )
        messages_path.write_text(old_style, encoding="utf-8")

        result = self._run(root)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        messages = messages_path.read_text(encoding="utf-8")
        # Five emits unchanged (no duplicates)...
        self.assertEqual(messages.count("_hermesBusEmit('hermes:message-sent'"), 1)
        self.assertEqual(messages.count("_hermesBusEmit('hermes:run-completed'"), 3)
        # ...and the stream block added once.
        self.assertEqual(messages.count("_hermesBusEmit('hermes:stream-event'"), 1)
        self.assertIn("vulpy-hermes-stream-event", messages)

    def test_mutated_wire_anchor_fails_loudly(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "messages.js").write_text(
            (root / "messages.js").read_text(encoding="utf-8").replace(
                "LIVE_STREAMS[activeSid]={streamId,source};",
                "LIVE_STREAMS[activeSid]={streamId,sourceX};",
            ),
            encoding="utf-8",
        )
        result = self._run(root)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("stream-event passthrough", result.stderr)

    def test_mutated_ui_js_fails_loudly(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "ui.js").write_text(
            (root / "ui.js").read_text(encoding="utf-8").replace(
                "messages:[],entries:[]",
                "messages:[],entries:[]X",
            ),
            encoding="utf-8",
        )
        result = self._run(root)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ui.js", result.stderr)
        self.assertIn("old text", result.stderr)

    def test_mutated_sessions_js_fails_loudly(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "sessions.js").write_text(
            (root / "sessions.js").read_text(encoding="utf-8").replace(
                "function _setActiveSessionUrl(sid){",
                "function _setActiveSessionUrl(sidX){",
            ),
            encoding="utf-8",
        )
        result = self._run(root)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("sessions.js", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_mutated_commands_js_fails_loudly(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "commands.js").write_text(
            (root / "commands.js").read_text(encoding="utf-8").replace(
                "if(result&&result.accepted){",
                "if(result&&result.acceptedX){",
            ),
            encoding="utf-8",
        )
        result = self._run(root)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("commands.js", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_mutated_messages_js_fails_loudly(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "messages.js").write_text(
            (root / "messages.js").read_text(encoding="utf-8").replace(
                "S.messages.push(userMsg);renderMessages();setBusy(true);",
                "S.messages.push(userMsg);renderMessages();setBusy(trueX);",
            ),
            encoding="utf-8",
        )
        result = self._run(root)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("messages.js", result.stderr)
        self.assertIn("appears 0 times", result.stderr)


if __name__ == "__main__":
    unittest.main()
