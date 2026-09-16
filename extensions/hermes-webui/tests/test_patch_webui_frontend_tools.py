"""Unit tests for scripts/patch-webui-frontend-tools.py (issue #144).

Pattern mirrors tests/test_patch_webui_gateway_legacy_surfaces.py: drive the
patcher as a subprocess against a throwaway fixture, then assert
markers/exit codes. The primary fixture is a copy of the CURRENT
/api/hermes-webui/api/gateway_chat.py (the exact file the patcher anchors
against at build time); when that path is unavailable (CI without the baked
image) the fixture falls back to the patcher's OWN anchor strings so the
tests stay correct when the anchors drift.

  - fresh file -> helper + instructions injection applied, exit 0
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated helper anchor -> exit 1, fail-loud names the anchor
  - mutated run-body anchor -> exit 1, fail-loud names the anchor
  - patched result py_compiles (syntax intact)
  - registry present -> block renders name/description/schema/instruction
  - registry missing / env unset -> "" (no injection, no crash)
"""

import importlib.util
import json
import os
import py_compile
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-frontend-tools.py"
UPSTREAM = Path("/app/hermes-webui/api/gateway_chat.py")


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_frontend_tools_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiFrontendToolsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _write_fixture(self, temporary):
        """Return the fixture gateway_chat.py path.

        ALWAYS assembles a deterministic PRISTINE file from the patcher's own
        anchor strings. Copying the live /app/hermes-webui/api/gateway_chat.py
        as the fixture was vacuous once the image contained the #144 injection
        (MARK present -> patcher no-ops -> tests passed against an already
        patched file). The live file is drift-guarded separately below.
        """
        fixture = Path(temporary.name) / "gateway_chat.py"
        fixture.write_text(
            "def _unrelated():\n    return 1\n\n\n"
            + "def _run_gateway_runs_api_streaming(\n"
            + "    session_id, msg_text, model, workspace, stream_id,\n"
            + "):\n"
            + "    instructions_parts = []\n"
            + "    conversation_history = []\n"
            + "    run_body = {}\n"
            + self.patcher.RUNBODY_OLD
            + "\n",
            encoding="utf-8",
        )
        return fixture

    def _run(self, gateway):
        return subprocess.run(
            ["python3", str(PATCHER), str(gateway)],
            capture_output=True,
            text=True,
        )

    def test_fresh_file_applies_injection(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        gateway = self._write_fixture(temporary)

        before = gateway.read_text(encoding="utf-8")
        # Anchors exist exactly once BEFORE the patch (upstream shape).
        self.assertEqual(before.count(self.patcher.HELPER_ANCHOR), 1)
        self.assertEqual(before.count(self.patcher.RUNBODY_OLD), 1)

        result = self._run(gateway)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = gateway.read_text(encoding="utf-8")
        self.assertEqual(text.count(self.patcher.MARK), 1)
        # Helper injected as a top-level function.
        self.assertIn("def _vulpy_frontend_tools_block_text() -> str:", text)
        # Injection appended to the run-body instructions construction.
        self.assertIn("_vulpy_ft_block = _vulpy_frontend_tools_block_text()", text)
        self.assertIn('run_body["instructions"] = (', text)
        # Block append must NOT be nested inside `if instructions_parts:` —
        # sessions without prefill instructions must still get the block.
        self.assertLess(
            text.index("_vulpy_ft_block = _vulpy_frontend_tools_block_text()"),
            text.index("if instructions_parts:"),
        )
        py_compile.compile(str(gateway), doraise=True)

    def test_rerun_is_idempotent(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        gateway = self._write_fixture(temporary)

        first = self._run(gateway)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = gateway.read_text(encoding="utf-8")

        second = self._run(gateway)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(gateway.read_text(encoding="utf-8"), first_text)

    def test_mutated_helper_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        gateway = self._write_fixture(temporary)
        gateway.write_text(
            gateway.read_text(encoding="utf-8").replace(
                "def _run_gateway_runs_api_streaming(",
                "def _run_gateway_runs_api_streaming_v2(",
            ),
            encoding="utf-8",
        )
        result = self._run(gateway)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("runs-api helper anchor", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_mutated_runbody_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        gateway = self._write_fixture(temporary)
        gateway.write_text(
            gateway.read_text(encoding="utf-8").replace(
                'run_body["instructions"] = "\\n\\n".join(part for part in instructions_parts if part)',
                'run_body["instructions"] = "\\n".join(part for part in instructions_parts if part)',
            ),
            encoding="utf-8",
        )
        result = self._run(gateway)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("run-body construction", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_block_missing_registry_returns_empty(self):
        """Registry absent (or env unset) -> "" — the chat path never crashes."""
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("HERMES_WEBUI_EXTENSION_DIR", None)
            self.assertEqual(self.patcher._vulpy_frontend_tools_block_text(), "")

        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        with mock.patch.dict(
            os.environ, {"HERMES_WEBUI_EXTENSION_DIR": temporary.name}, clear=False
        ):
            self.assertEqual(self.patcher._vulpy_frontend_tools_block_text(), "")

    def test_block_renders_registry_contents(self):
        """Registry present -> name, description, schema and instruction."""
        payload = {
            "version": 1,
            "tools": [
                {
                    "name": "create_chart",
                    "description": "Render a data chart in the operator pane.",
                    "schema": {
                        "type": "object",
                        "properties": {"chart_type": {"type": "string"}},
                        "required": ["chart_type"],
                    },
                    "renderer": "chart",
                },
                {
                    "name": "render_preview",
                    "description": "Preview a local file without passing its content.",
                    "schema": {
                        "type": "object",
                        "properties": {"type": {"type": "string"}, "path": {"type": "string"}},
                        "required": ["type", "path"],
                    },
                    "renderer": "preview",
                }
            ],
        }
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        reg_dir = Path(temporary.name) / "frontend-tools"
        reg_dir.mkdir()
        (reg_dir / "registry.json").write_text(
            json.dumps(payload), encoding="utf-8"
        )

        with mock.patch.dict(
            os.environ, {"HERMES_WEBUI_EXTENSION_DIR": temporary.name}, clear=False
        ):
            block = self.patcher._vulpy_frontend_tools_block_text()

        self.assertIn("create_chart", block)
        self.assertIn("Render a data chart in the operator pane.", block)
        self.assertIn('"chart_type"', block)
        self.assertIn("pane renders the result from the arguments", block)
        self.assertIn("render_preview", block)
        self.assertIn("Preview a local file without passing its content.", block)
        self.assertIn('"path"', block)

    def test_block_malformed_registry_returns_empty(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        reg_dir = Path(temporary.name) / "frontend-tools"
        reg_dir.mkdir()
        (reg_dir / "registry.json").write_text("{not json", encoding="utf-8")
        with mock.patch.dict(
            os.environ, {"HERMES_WEBUI_EXTENSION_DIR": temporary.name}, clear=False
        ):
            self.assertEqual(self.patcher._vulpy_frontend_tools_block_text(), "")

    def test_live_upstream_is_pristine_or_fully_patched(self):
        """Drift guard: the live gateway_chat.py must be either untouched by
        #144 (no marker, RUNBODY_OLD anchor intact) or fully patched (marker +
        helper + run-body append) and still compiles. A half-patched live file
        means a rebuild would double-apply or anchors have drifted."""
        if not UPSTREAM.is_file():
            self.skipTest("live gateway_chat.py not available")
        live = UPSTREAM.read_text(encoding="utf-8")
        if self.patcher.MARK in live:
            self.assertIn("def _vulpy_frontend_tools_block_text() -> str:", live)
            self.assertIn("_vulpy_ft_block = _vulpy_frontend_tools_block_text()", live)
            self.assertLess(
                live.index("_vulpy_ft_block = _vulpy_frontend_tools_block_text()"),
                live.index("if instructions_parts:"),
            )
            py_compile.compile(str(UPSTREAM), doraise=True)
        else:
            self.assertEqual(live.count(self.patcher.RUNBODY_OLD), 1)


if __name__ == "__main__":
    unittest.main()
