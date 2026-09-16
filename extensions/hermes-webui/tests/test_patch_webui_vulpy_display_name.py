"""Unit tests for scripts/patch-webui-vulpy-display-name.py.

Pattern mirrors tests/test_patch_agent_length_continuation_boost.py: drive
the patcher as a subprocess against a throwaway config.py fixture built from
the patcher's own pristine anchor constant, then assert markers/exit codes.

  - fresh file -> display entry injected, idempotency mark appears
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated anchor -> exit 1, fail-loud error names the missing anchor
  - wrong arg count -> exit 1, Usage printed to stderr
"""

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-vulpy-display-name.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_vulpy_display_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiVulpyDisplayNameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixture(self) -> tuple:
        tmp = tempfile.TemporaryDirectory()
        target = Path(tmp.name) / "config.py"
        target.write_text(
            "# config.py fixture\n"
            + self.patcher.ANCHOR
            + '\n    "openrouter": "OpenRouter",\n'
            + '    "anthropic": "Anthropic",\n'
            + "}\n",
            encoding="utf-8",
        )
        return tmp, target

    def _run(self, target) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["python3", str(PATCHER), str(target)],
            capture_output=True,
            text=True,
        )

    def test_fresh_file_patches_display_name(self):
        tmp, target = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        result = self._run(target)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = target.read_text(encoding="utf-8")
        self.assertEqual(text.count(self.patcher.IDEMPOTENCY_MARK), 1)
        self.assertIn('"vulpy": "Vulpy Cloud"', text)
        # The entry landed inside the map, before the existing first key
        self.assertLess(
            text.index('"vulpy": "Vulpy Cloud"'),
            text.index('"nous": "Nous Portal"'),
        )

    def test_rerun_is_idempotent(self):
        tmp, target = self._make_fixture()
        self.addCleanup(tmp.cleanup)

        first = self._run(target)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = target.read_text(encoding="utf-8")

        second = self._run(target)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout.lower())
        self.assertEqual(target.read_text(encoding="utf-8"), first_text)

    def test_mutated_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        target = Path(tmp.name) / "config.py"
        target.write_text(
            "# fixture\n"
            + "_PROVIDER_DISPLAY = {\n"
            + '    "nous": "Renamed Entry",\n'
            + "}\n",
            encoding="utf-8",
        )
        result = self._run(target)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("anchor", result.stderr + result.stdout)
        self.assertNotIn(self.patcher.IDEMPOTENCY_MARK, target.read_text(encoding="utf-8"))

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
