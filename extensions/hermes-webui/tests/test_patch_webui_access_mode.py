"""Unit tests for scripts/patch-webui-access-mode.py.

Drives the patcher as a subprocess against throwaway routes.py /
streaming.py fixtures assembled from the patcher's own anchor strings
(mirrors tests/test_patch_webui_frontend_tools.py). Asserts:

  - fresh files -> POST /api/access-mode handler + dispatch injected into
    routes.py; per-session access-mode block helper + ephemeral-prompt
    injection added to streaming.py; exit 0.
  - re-run on patched files -> exit 0 "already patched", no double-apply.
  - mutated anchors -> exit 1, fail-loud names the anchor.
  - patched files py_compile (syntax intact).
  - the payload sanitization helper (validate_access_mode_fields) accepts the
    three exact modes and rejects paths/HTML/traversal/oversized origins.
"""

import importlib.util
import py_compile
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-access-mode.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_access_mode_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiAccessModeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    # ------------------------------------------------------------------
    # Fixture builders — deterministic PRISTINE files from the patcher's
    # own anchor strings so the tests stay correct when anchors drift.
    # ------------------------------------------------------------------
    def _write_routes_fixture(self, temporary):
        routes = Path(temporary.name) / "routes.py"
        routes.write_text(
            "import json\nimport os\nimport re\nimport time\nimport uuid\nfrom pathlib import Path\n"
            + "from api.helpers import require, bad, j, safe_resolve, _sanitize_error\n"
            + "from api.models import get_session_for_file_ops\n\n"
            + "# dispatcher\n"
            + "def _handle_http(handler, parsed, body):\n"
            + self.patcher.DISPATCH_ANCHOR
            + "\n"
            + "    return bad(handler, 'unknown')\n\n"
            + "# handlers\n"
            + self.patcher.HANDLER_INSERT_ANCHOR
            + "\n"
            + "    return bad(handler, 'y')\n",
            encoding="utf-8",
        )
        return routes

    def _write_streaming_fixture(self, temporary):
        streaming = Path(temporary.name) / "streaming.py"
        streaming.write_text(
            "import json\nimport os\nimport re\n"
            + self.patcher.STREAMING_HELPER_ANCHOR
            + "    personality_prompt, surface_context, config_data,\n"
            + "):\n"
            + "    parts = []\n"
            + self.patcher.EPHEMERAL_ANCHOR
            + "\n"
            + "def _other():\n"
            + "    return 1\n",
            encoding="utf-8",
        )
        return streaming

    def _run(self, routes, streaming):
        return subprocess.run(
            ["python3", str(PATCHER), str(routes), str(streaming)],
            capture_output=True,
            text=True,
        )

    # ------------------------------------------------------------------
    # Fresh files -> patched
    # ------------------------------------------------------------------
    def test_fresh_files_patch_both(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        routes = self._write_routes_fixture(temporary)
        streaming = self._write_streaming_fixture(temporary)

        result = self._run(routes, streaming)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        routes_text = routes.read_text(encoding="utf-8")
        self.assertGreaterEqual(routes_text.count(self.patcher.MARK_ROUTES), 1)
        self.assertIn("def _handle_access_mode_set(handler, body):", routes_text)
        self.assertIn('if parsed.path == "/api/access-mode":', routes_text)
        py_compile.compile(str(routes), doraise=True)

        streaming_text = streaming.read_text(encoding="utf-8")
        self.assertGreaterEqual(streaming_text.count(self.patcher.MARK_STREAMING), 1)
        self.assertIn("def _vulpy_access_mode_block_text(session_id, workspace):", streaming_text)
        self.assertIn("_vulpy_am_block = _vulpy_access_mode_block_text(", streaming_text)
        py_compile.compile(str(streaming), doraise=True)

    def test_rerun_is_idempotent(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        routes = self._write_routes_fixture(temporary)
        streaming = self._write_streaming_fixture(temporary)

        first = self._run(routes, streaming)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        routes_first = routes.read_text(encoding="utf-8")
        streaming_first = streaming.read_text(encoding="utf-8")

        second = self._run(routes, streaming)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(routes.read_text(encoding="utf-8"), routes_first)
        self.assertEqual(streaming.read_text(encoding="utf-8"), streaming_first)

    # ------------------------------------------------------------------
    # Mutated anchors -> fail-loud
    # ------------------------------------------------------------------
    def test_mutated_routes_dispatch_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        routes = self._write_routes_fixture(temporary)
        streaming = self._write_streaming_fixture(temporary)
        routes.write_text(
            routes.read_text(encoding="utf-8").replace(
                "/api/file/open-vscode",
                "/api/file/open-vscode-renamed",
            ),
            encoding="utf-8",
        )
        result = self._run(routes, streaming)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("routes dispatch anchor", result.stderr)

    def test_mutated_streaming_ephemeral_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        routes = self._write_routes_fixture(temporary)
        streaming = self._write_streaming_fixture(temporary)
        streaming.write_text(
            streaming.read_text(encoding="utf-8").replace(
                "return \"\\n\\n\".join(part for part in parts if part)",
                "return \"\\n\".join(part for part in parts if part)",
            ),
            encoding="utf-8",
        )
        result = self._run(routes, streaming)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("streaming ephemeral anchor", result.stderr)

    def test_mutated_streaming_helper_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        routes = self._write_routes_fixture(temporary)
        streaming = self._write_streaming_fixture(temporary)
        streaming.write_text(
            streaming.read_text(encoding="utf-8").replace(
                "def _webui_ephemeral_system_prompt(",
                "def _webui_ephemeral_system_prompt_v2(",
            ),
            encoding="utf-8",
        )
        result = self._run(routes, streaming)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("streaming helper anchor", result.stderr)

    # ------------------------------------------------------------------
    # Payload sanitization
    # ------------------------------------------------------------------
    def test_validate_accepts_exact_modes(self):
        for mode in ("tailscale", "public", "local"):
            self.assertIsNone(
                self.patcher.validate_access_mode_fields(
                    {"mode": mode, "origin": "example.com"},
                ),
                mode,
            )

    def test_validate_rejects_bad_mode(self):
        for mode in ("", "ts", "host.docker.internal", "tailscale\n", "<b>"):
            err = self.patcher.validate_access_mode_fields(
                {"mode": mode, "origin": "example.com"},
            )
            self.assertIsNotNone(err)

    def test_validate_rejects_paths_html_traversal(self):
        bad_origins = [
            "example.com/path",
            "example.com\\path",
            "example.com..",
            "https://example.com",
            "exa mple.com",
            "<script>",
            "a" * 300,  # oversized
        ]
        for origin in bad_origins:
            err = self.patcher.validate_access_mode_fields(
                {"mode": "public", "origin": origin},
            )
            self.assertIsNotNone(err, origin)

    def test_validate_rejects_missing_fields(self):
        self.assertIsNotNone(self.patcher.validate_access_mode_fields({}))
        self.assertIsNotNone(self.patcher.validate_access_mode_fields({"mode": "public"}))
        self.assertIsNotNone(self.patcher.validate_access_mode_fields({"origin": "x.com"}))


if __name__ == "__main__":
    unittest.main()
