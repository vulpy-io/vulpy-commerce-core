"""Unit tests for scripts/patch-webui-vulpy-model-labels.py.

Pattern mirrors tests/test_patch_agent_length_continuation_boost.py: drive
the patcher as a subprocess against throwaway fixtures built from the
patcher's own pristine anchor constants, then assert markers/exit codes.

  - fresh files -> helper added + import wired + labels applied, mark appears
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
PATCHER = ROOT / "scripts" / "patch-webui-vulpy-model-labels.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_vulpy_labels_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiVulpyModelLabelsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixtures(self) -> tuple:
        tmp = tempfile.TemporaryDirectory()
        config = Path(tmp.name) / "config.py"
        config.write_text(
            "# config.py fixture\n"
            + self.patcher.CONFIG_IMPORT_ANCHOR
            + "\n\n"
            + "# ... catalog builder ...\n"
            + self.patcher.CONFIG_GROUP_ANCHOR
            + "\n",
            encoding="utf-8",
        )
        providers = Path(tmp.name) / "plugin_providers.py"
        providers.write_text(
            "# plugin_providers.py fixture\n"
            + self.patcher.PROVIDERS_ANCHOR
            + "\n\n"
            + "def effective_provider_env_var(provider_id, static_map):\n"
            + "    return None\n",
            encoding="utf-8",
        )
        return tmp, config, providers

    def _run(self, config, providers) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["python3", str(PATCHER), str(config), str(providers)],
            capture_output=True,
            text=True,
        )

    def test_fresh_files_patch_all_surfaces(self):
        tmp, config, providers = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        result = self._run(config, providers)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        p_text = providers.read_text(encoding="utf-8")
        c_text = config.read_text(encoding="utf-8")
        # Helper function added to plugin_providers.py
        self.assertIn("def plugin_model_provider_model_labels(", p_text)
        self.assertIn("getattr(profile, \"model_labels\", None)", p_text)
        # Import wired in config.py
        self.assertIn("plugin_model_provider_model_labels as _plugin_model_provider_model_labels", c_text)
        # Label application present and placed before the group append
        self.assertIn("_plugin_labels = _plugin_model_provider_model_labels(pid)", c_text)
        self.assertLess(
            c_text.index("_plugin_labels = _plugin_model_provider_model_labels(pid)"),
            c_text.index("_append_picker_group(provider_name, pid, raw_models)"),
        )
        # Idempotency marks
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, p_text)
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, c_text)

    def test_rerun_is_idempotent(self):
        tmp, config, providers = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        first = self._run(config, providers)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_c = config.read_text(encoding="utf-8")
        first_p = providers.read_text(encoding="utf-8")

        second = self._run(config, providers)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout.lower())
        self.assertEqual(config.read_text(encoding="utf-8"), first_c)
        self.assertEqual(providers.read_text(encoding="utf-8"), first_p)

    def test_mutated_config_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        config = Path(tmp.name) / "config.py"
        config.write_text(
            "# fixture\n"
            + self.patcher.CONFIG_IMPORT_ANCHOR
            + "\n\n"
            + "            detected_models = auto_detected_models_by_provider.get(pid, [])\n"
            + "            _append_picker_group(provider_name, pid, raw_models)\n",
            encoding="utf-8",
        )
        providers = Path(tmp.name) / "plugin_providers.py"
        providers.write_text(
            "# fixture\n" + self.patcher.PROVIDERS_ANCHOR + "\n",
            encoding="utf-8",
        )
        result = self._run(config, providers)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("config-group", result.stderr + result.stdout)

    def test_usage_requires_two_args(self):
        result = subprocess.run(
            ["python3", str(PATCHER), "a.py"],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
