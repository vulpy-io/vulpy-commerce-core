"""Tests for the build-time demo read-only WebUI patch."""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-demo-read-only.py"


def load_patcher():
    spec = importlib.util.spec_from_file_location("demo_read_only_patcher", PATCHER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DemoReadOnlyPatcherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = load_patcher()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        server = root / "server.py"
        routes = root / "routes.py"
        index = root / "index.html"
        messages = root / "messages.js"
        server.write_text(self.patcher.SERVER_ANCHOR, encoding="utf-8")
        routes.write_text(self.patcher.ROUTES_CONFIG_ANCHOR + "\n", encoding="utf-8")
        index.write_text(self.patcher.INDEX_ANCHOR, encoding="utf-8")
        messages.write_text(self.patcher.MESSAGES_ANCHOR, encoding="utf-8")
        return temporary, server, routes, index, messages

    def run_patcher(self, server, routes, index, messages):
        return subprocess.run(
            ["python3", str(PATCHER), str(server), str(routes), str(index), str(messages)],
            capture_output=True,
            text=True,
        )

    def test_patches_server_and_visible_write_controls(self):
        temporary, server, routes, index, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        result = self.run_patcher(server, routes, index, messages)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        server_text = server.read_text(encoding="utf-8")
        index_text = index.read_text(encoding="utf-8")
        messages_text = messages.read_text(encoding="utf-8")
        self.assertIn(self.patcher.SERVER_MARKER, server_text)
        self.assertIn(self.patcher.INDEX_MARKER, index_text)
        self.assertIn(self.patcher.MESSAGES_MARKER, messages_text)
        self.assertIn("demoReadOnly", index_text)
        self.assertIn("btnSend", index_text)
        self.assertIn("approvalBtnOnce", index_text)
        self.assertIn("__vulpyDisableDemoReadOnlyControls", messages_text)

    def test_rerun_is_idempotent(self):
        temporary, server, routes, index, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        first = self.run_patcher(server, routes, index, messages)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_contents = [p.read_text(encoding="utf-8") for p in (server, index, messages)]
        second = self.run_patcher(server, routes, index, messages)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(first_contents, [p.read_text(encoding="utf-8") for p in (server, index, messages)])

    def test_anchor_drift_fails_loudly(self):
        temporary, server, routes, index, messages = self.fixture()
        self.addCleanup(temporary.cleanup)
        index.write_text("<html></html>\n", encoding="utf-8")
        result = self.run_patcher(server, routes, index, messages)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("index.html anchor", result.stderr + result.stdout)

    def test_usage_requires_all_targets(self):
        result = subprocess.run(["python3", str(PATCHER), "server.py"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()
