"""Unit tests for scripts/patch-webui-gateway-legacy-surfaces.py (issue #136).

Pattern mirrors tests/test_patch_ui.py: drive the patcher as a subprocess
against throwaway fixture files, then assert markers/exit codes.

Covers the 3-arg invocation (runner_client.py, streaming.py, routes.py):
  - fresh (unpatched) files -> each file gains its legacy-surfaces marker
  - re-run on patched files -> exit 0 "already patched", no double-apply
  - mutated anchor -> exit 1, fail-loud error names the missing anchor

Fixtures are built from the patcher's OWN anchor/old strings (imported via
importlib) so the tests stay correct when the patcher's anchors drift.
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-gateway-legacy-surfaces.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_gw_legacy_surfaces_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_old_texts(path: Path, patches) -> None:
    """Write a fixture file whose content is exactly the patcher's old texts.

    Every patch's ``old`` starts with its ``anchor``, so a fixture built from
    the old texts satisfies both the anchor-count check (each appears once)
    and the old-text replace step.
    """
    path.write_text("\n\n".join(p["old"] for p in patches) + "\n", encoding="utf-8")


class PatchWebuiGatewayLegacySurfacesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        runner = root / "runner_client.py"
        streaming = root / "streaming.py"
        routes = root / "routes.py"
        _write_old_texts(runner, self.patcher.RUNNER_PATCHES)
        _write_old_texts(streaming, self.patcher.STREAMING_PATCHES)
        _write_old_texts(routes, self.patcher.ROUTES_PATCHES)
        return temporary, runner, streaming, routes

    def _run(self, runner, streaming, routes):
        return subprocess.run(
            ["python3", str(PATCHER), str(runner), str(streaming), str(routes)],
            capture_output=True,
            text=True,
        )

    def test_fresh_files_patch_all_three_surfaces(self):
        temporary, runner, streaming, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(runner, streaming, routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        runner_text = runner.read_text(encoding="utf-8")
        streaming_text = streaming.read_text(encoding="utf-8")
        routes_text = routes.read_text(encoding="utf-8")

        # runner_client.py: steer_run + list_pending_approvals
        self.assertEqual(runner_text.count(self.patcher.MARK_RUNNER), 1)
        self.assertIn("def steer_run", runner_text)
        self.assertIn("def list_pending_approvals", runner_text)

        # streaming.py: gateway branch in _handle_chat_steer
        self.assertEqual(streaming_text.count(self.patcher.MARK_STREAMING), 1)
        self.assertIn("webui_gateway_chat_enabled", streaming_text)

        # routes.py: cross-session approvals + children merge
        self.assertEqual(routes_text.count(self.patcher.MARK_ROUTES), 1)
        self.assertIn("def _gateway_children_sidebar_rows", routes_text)
        self.assertIn("def _collect_cross_session_pending_approvals", routes_text)
        self.assertIn("def _gateway_pending_run_id_by_stamp", routes_text)

    def test_rerun_is_idempotent(self):
        temporary, runner, streaming, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        first = self._run(runner, streaming, routes)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_runner = runner.read_text(encoding="utf-8")
        first_streaming = streaming.read_text(encoding="utf-8")
        first_routes = routes.read_text(encoding="utf-8")

        second = self._run(runner, streaming, routes)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(runner.read_text(encoding="utf-8"), first_runner)
        self.assertEqual(streaming.read_text(encoding="utf-8"), first_streaming)
        self.assertEqual(routes.read_text(encoding="utf-8"), first_routes)

    def test_mutated_anchor_fails_loudly_for_each_file(self):
        # runner_client.py anchor destroyed
        temporary, runner, streaming, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        runner.write_text("def respond_clarify(self, run_id): pass\n", encoding="utf-8")
        result = self._run(runner, streaming, routes)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

        # streaming.py anchor destroyed
        temporary, runner, streaming, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        streaming.write_text("def _handle_chat_steer(): pass\n", encoding="utf-8")
        result = self._run(runner, streaming, routes)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

        # routes.py anchor destroyed
        temporary, runner, streaming, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        routes.write_text("def _handle_approval_pending(): pass\n", encoding="utf-8")
        result = self._run(runner, streaming, routes)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor not found", result.stderr + result.stdout)

    def test_usage_requires_three_args(self):
        temporary, runner, streaming, _routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        result = subprocess.run(
            ["python3", str(PATCHER), str(runner), str(streaming)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
