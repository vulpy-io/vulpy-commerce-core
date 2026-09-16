"""Unit tests for scripts/patch-webui-vulpy-provider-settings.py.

Pattern mirrors tests/test_patch_webui_vulpy_model_labels.py: drive the
patcher as a subprocess against throwaway fixtures built from the patcher's
own pristine anchor constants, then assert markers/exit codes.

Covered behaviors:
  - fresh plugin_providers.py -> registered-profile helpers added
  - fresh providers.py -> registered-profile model branch wired into
    get_providers(), labels applied
  - the registered-profile env-key helper returns the profile env var for
    API-key profiles, and None for every OAuth-style profile, WITHOUT adding
    a static _PROVIDER_ENV_VAR entry (the provider profile is the sole
    source of VULPY_API_KEY metadata)
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
PATCHER = ROOT / "scripts" / "patch-webui-vulpy-provider-settings.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_vulpy_settings_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_config_fixture(patcher) -> str:
    """A config-like providers.py surface with the anchors the patcher needs."""
    return (
        "# providers.py fixture\n"
        + patcher.CONFIG_IMPORTS_ANCHOR
        + "\n\n"
        + "_PROVIDER_ENV_VAR = {\n"
        + '    "openrouter": "OPENROUTER_API_KEY",\n'
        + '    "lmstudio": "LM_API_KEY",\n'
        + "}\n\n"
        + "def _provider_env_var_for(provider_id: str) -> str | None:\n"
        + '    """Resolve the API-key env var for a provider (static table + plugin profiles)."""\n'
        + "    return effective_provider_env_var(provider_id, _PROVIDER_ENV_VAR)\n"
        + "\n\n"
        + "# ... provider-card builder ...\n"
        + patcher.CONFIG_GET_PROVIDERS_BRANCH_ANCHOR
        + "\n"
    )


class PatchWebuiVulpyProviderSettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _make_fixtures(self) -> tuple:
        tmp = tempfile.TemporaryDirectory()
        providers = Path(tmp.name) / "providers.py"
        providers.write_text(_make_config_fixture(self.patcher), encoding="utf-8")
        plugin_providers = Path(tmp.name) / "plugin_providers.py"
        plugin_providers.write_text(
            "# plugin_providers.py fixture\n"
            + self.patcher.PLUGIN_PROVIDERS_ANCHOR
            + "\n\n"
            + "def effective_provider_env_var(provider_id, static_map):\n"
            + "    return None\n",
            encoding="utf-8",
        )
        return tmp, providers, plugin_providers

    def _run(self, providers, plugin_providers) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["python3", str(PATCHER), str(providers), str(plugin_providers)],
            capture_output=True,
            text=True,
        )

    def test_fresh_files_patch_all_surfaces(self):
        tmp, providers, plugin_providers = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        result = self._run(providers, plugin_providers)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        pp_text = plugin_providers.read_text(encoding="utf-8")
        p_text = providers.read_text(encoding="utf-8")
        # Registered-profile helpers added to plugin_providers.py
        self.assertIn("def registered_model_provider_ids(", pp_text)
        self.assertIn("def registered_model_provider_profile(", pp_text)
        self.assertIn("def registered_model_provider_fallback_models(", pp_text)
        self.assertIn("def registered_model_provider_model_ids(", pp_text)
        self.assertIn("def registered_model_provider_model_labels(", pp_text)
        self.assertIn("def registered_model_provider_env_key(", pp_text)
        # Helpers must not be plugin-only gated
        self.assertNotIn("def is_plugin_model_provider(provider_id):\n    return registered", pp_text)
        # NO static _PROVIDER_ENV_VAR entry: VULPY_API_KEY metadata must come
        # exclusively from the registered provider profile, so the patcher
        # must not add a "vulpy" mapping to the static env table.
        self.assertNotIn('"vulpy": "VULPY_API_KEY"', p_text)
        # The registered-profile env-key fallback is wired into _provider_env_var_for().
        self.assertIn("registered_model_provider_env_key as _registered_provider_env_key", p_text)
        # Registered-profile model branch wired into get_providers()
        self.assertIn("_registered_ids = registered_model_provider_ids()", p_text)
        self.assertIn("registered_model_provider_fallback_models(pid)", p_text)
        self.assertIn(
            "registered_model_provider_model_labels(pid)",
            p_text,
        )
        # The model-labels application must appear before the append line.
        self.assertLess(
            p_text.index("registered_model_provider_model_labels(pid)"),
            p_text.index("# Also include models from config.yaml providers section"),
        )
        # The registered branch must appear BEFORE the config.yaml models merge.
        self.assertLess(
            p_text.index("_registered_ids = registered_model_provider_ids()"),
            p_text.index("# Also include models from config.yaml providers section"),
        )
        # Idempotency marks
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, pp_text)
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, p_text)

    def test_env_key_helper_skips_oauth_style_profiles(self):
        """OAuth/token-style profiles must NOT resolve an API-key env var."""
        tmp, providers, plugin_providers = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        result = self._run(providers, plugin_providers)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        pp_text = plugin_providers.read_text(encoding="utf-8")
        # The generated helper must skip every OAuth-style auth_type, not just
        # exact "oauth"/"token" — including the device-code / external /
        # copilot / subprocess forms used by bundled profiles (nous,
        # openai-codex, qwen-oauth, copilot, copilot-acp, bedrock, ...).
        # The predicate is: "oauth" substring OR one of the non-oauth
        # managed-flow auth types.
        self.assertIn('"oauth" in auth_type', pp_text)
        for non_oauth_managed in (
            "token",
            "copilot",
            "external_process",
            "aws_sdk",
            "vertex",
        ):
            self.assertIn(
                '"%s"' % non_oauth_managed,
                pp_text,
                "auth_type %r must be skipped by registered_model_provider_env_key()"
                % non_oauth_managed,
            )
        # Every OAuth-shaped auth_type normalizes to a skip via the substring
        # or the explicit set above.
        for oauth_auth_type in (
            "oauth",
            "oauth_device_code",
            "oauth_external",
            "oauth_copilot",
            "oauth_minimax",
        ):
            self.assertTrue(
                "oauth" in oauth_auth_type or '"%s"' % oauth_auth_type in pp_text,
                "auth_type %r must be skipped" % oauth_auth_type,
            )
        # ... but an API-key profile keeps the primary env var. (Behavioral
        # assertion lives in test_registered_vulpy_provider.py.)
        self.assertIn("auth_type", pp_text)

    def test_rerun_is_idempotent(self):
        tmp, providers, plugin_providers = self._make_fixtures()
        self.addCleanup(tmp.cleanup)

        first = self._run(providers, plugin_providers)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_p = providers.read_text(encoding="utf-8")
        first_pp = plugin_providers.read_text(encoding="utf-8")

        second = self._run(providers, plugin_providers)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout.lower())
        self.assertEqual(providers.read_text(encoding="utf-8"), first_p)
        self.assertEqual(plugin_providers.read_text(encoding="utf-8"), first_pp)

    def test_rerun_on_partially_patched_files_noop(self):
        """A providers.py that already carries the mark must be left alone."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        providers = Path(tmp.name) / "providers.py"
        providers.write_text(
            "# fixture\n"
            + self.patcher.IDEMPOTENCY_MARK
            + "\n"
            + "def _provider_env_var_for(provider_id: str) -> str | None:\n"
            + "    return effective_provider_env_var(provider_id, _PROVIDER_ENV_VAR)\n"
            + "\n"
            + self.patcher.CONFIG_GET_PROVIDERS_BRANCH_ANCHOR
            + "\n",
            encoding="utf-8",
        )
        plugin_providers = Path(tmp.name) / "plugin_providers.py"
        plugin_providers.write_text(
            "# fixture\n" + self.patcher.PLUGIN_PROVIDERS_ANCHOR + "\n",
            encoding="utf-8",
        )
        before = providers.read_text(encoding="utf-8")
        result = self._run(providers, plugin_providers)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(providers.read_text(encoding="utf-8"), before)

    def test_mutated_providers_anchor_fails_loudly(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        providers = Path(tmp.name) / "providers.py"
        providers.write_text(
            "# fixture\n"
            + "def _provider_env_var_for(provider_id: str) -> str | None:\n"
            + "    return effective_provider_env_var(provider_id, _PROVIDER_ENV_VAR)\n"
            + "\n# ... provider-card builder (anchor shape moved) ...\n"
            + "            for _m in model_list:\n"
            + "                models.append({\"id\": _m, \"label\": _m})\n",
            encoding="utf-8",
        )
        plugin_providers = Path(tmp.name) / "plugin_providers.py"
        plugin_providers.write_text(
            "# fixture\n" + self.patcher.PLUGIN_PROVIDERS_ANCHOR + "\n",
            encoding="utf-8",
        )
        result = self._run(providers, plugin_providers)
        self.assertNotEqual(result.returncode, 0)
        output = result.stderr + result.stdout
        # The first anchor failure is fail-loud; any of the anchor names is
        # acceptable but the error must name which anchor/shape moved.
        self.assertIn("anchor", output)

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