"""Regression tests: a registered static provider profile (Vulpy Cloud).

Vulpy Cloud is a bundled model-provider plugin whose profile is registered
via ``providers.list_providers()`` AND appears in WebUI's static
``_PROVIDER_DISPLAY`` (it has no ``_PROVIDER_MODELS`` entry).  It must be a
MANAGEABLE provider in Settings → Providers — configurable via its declared
primary env var (VULPY_API_KEY), with a model list from the live catalog or
the profile's fallback models and friendly aliases — WITHOUT becoming a
plugin-only provider.

These tests drive the REAL patched api.providers.get_providers() against a
fake Vulpy profile, mirroring tests/test_plugin_model_providers.py.
"""

from __future__ import annotations

import sys
import types
from types import SimpleNamespace

import api.config as config
import api.profiles as profiles
from api.plugin_providers import invalidate_plugin_model_provider_cache


def _install_fake_vulpy_plugin(monkeypatch):
    profile = SimpleNamespace(
        name="vulpy",
        display_name="Vulpy Cloud",
        env_vars=("VULPY_API_KEY", "VULPY_BASE_URL", "OPENAI_API_KEY"),
        auth_type="api_key",
        base_url="https://gateway.vulpy.io",
        aliases=("vulpy-cloud",),
        fallback_models=(
            "vulpy-default",
            "vulpy-smart",
            "vulpy-coder",
            "vulpy-writer",
            "vulpy-vision",
            "vulpy-cutting-edge",
            "vulpy-embed",
            "vulpy-image",
        ),
        model_labels={
            "vulpy-default": "DeepSeek V4 Flash",
            "vulpy-smart": "Claude Sonnet 4",
            "vulpy-coder": "Kimi K3",
            "vulpy-writer": "GPT-5 Writer",
        },
    )

    def _fake_list_providers():
        return [profile]

    fake_providers = types.ModuleType("providers")
    fake_providers.list_providers = _fake_list_providers
    monkeypatch.setitem(sys.modules, "providers", fake_providers)
    invalidate_plugin_model_provider_cache()


def _install_fake_hermes_cli(monkeypatch, *, model_ids: list[str] | None = None):
    fake_pkg = types.ModuleType("hermes_cli")
    fake_pkg.__path__ = []

    fake_models = types.ModuleType("hermes_cli.models")
    fake_models.provider_model_ids = lambda pid: list(model_ids or []) if pid == "vulpy" else []

    fake_auth = types.ModuleType("hermes_cli.auth")
    fake_auth.get_auth_status = lambda pid: {}

    monkeypatch.setitem(sys.modules, "hermes_cli", fake_pkg)
    monkeypatch.setitem(sys.modules, "hermes_cli.models", fake_models)
    monkeypatch.setitem(sys.modules, "hermes_cli.auth", fake_auth)


def _reset_config(monkeypatch, tmp_path):
    monkeypatch.setattr(profiles, "get_active_hermes_home", lambda: tmp_path)
    old_cfg = dict(config.cfg)
    old_mtime = config._cfg_mtime
    config.cfg.clear()
    config.cfg["model"] = {"provider": "vulpy", "default": "vulpy-default"}
    try:
        config._cfg_mtime = config.Path(config._get_config_path()).stat().st_mtime
    except Exception:
        config._cfg_mtime = 0.0
    return old_cfg, old_mtime


def _restore_config(old_cfg, old_mtime):
    config.cfg.clear()
    config.cfg.update(old_cfg)
    config._cfg_mtime = old_mtime
    config.invalidate_models_cache()


class TestRegisteredVulpyProviderSettings:
    def test_profile_env_var_pointed_to_vulpy_api_key(self, monkeypatch):
        """The profile's declared primary env var must be VULPY_API_KEY."""
        _install_fake_vulpy_plugin(monkeypatch)
        from api.plugin_providers import registered_model_provider_env_key

        assert registered_model_provider_env_key("vulpy") == "VULPY_API_KEY"

    def test_static_map_has_no_vulpy_entry_profile_is_sole_source(self, monkeypatch):
        """A profile-derived VULPY_API_KEY works WITHOUT a static map entry.

        _PROVIDER_ENV_VAR must NOT carry a "vulpy" key — the registered
        provider profile is the sole source of VULPY_API_KEY metadata, and
        _provider_env_var_for() falls back to it only when the static map has
        no entry.
        """
        _install_fake_vulpy_plugin(monkeypatch)
        import api.providers as providers_mod

        assert "vulpy" not in providers_mod._PROVIDER_ENV_VAR
        assert providers_mod._provider_env_var_for("vulpy") == "VULPY_API_KEY"

    def test_oauth_style_profiles_return_no_env_key(self, monkeypatch):
        """OAuth/token-style profiles must not resolve an API-key env var."""
        from api.plugin_providers import invalidate_plugin_model_provider_cache

        def _profile_with(auth_type, env_vars=("SOME_TOKEN",)):
            return SimpleNamespace(name="oauthish", auth_type=auth_type, env_vars=env_vars)

        profiles = [
            _profile_with("oauth_device_code"),
            _profile_with("oauth_external"),
            _profile_with("oauth_copilot"),
            _profile_with("copilot"),
            _profile_with("external_process"),
            _profile_with("aws_sdk"),
            _profile_with("vertex"),
            _profile_with("token"),
        ]
        fake_providers = types.ModuleType("providers")
        fake_providers.list_providers = lambda: profiles
        monkeypatch.setitem(sys.modules, "providers", fake_providers)
        invalidate_plugin_model_provider_cache()
        try:
            from api.plugin_providers import registered_model_provider_env_key

            # All profiles share the slug "oauthish" but each carries a
            # distinct OAuth-style auth_type — every one must be skipped.
            for _ in profiles:
                assert registered_model_provider_env_key("oauthish") is None
        finally:
            invalidate_plugin_model_provider_cache()

    def test_get_providers_row_for_registered_static_provider(self, monkeypatch, tmp_path):
        _install_fake_vulpy_plugin(monkeypatch)
        _install_fake_hermes_cli(monkeypatch)
        old_cfg, old_mtime = _reset_config(monkeypatch, tmp_path)
        env_path = tmp_path / ".env"
        env_path.write_text("VULPY_API_KEY=test-vulpy-key-12345\n", encoding="utf-8")
        try:
            from api.providers import get_providers

            result = get_providers()
            row = next((p for p in result["providers"] if p["id"] == "vulpy"), None)
            assert row is not None, "vulpy must appear in Settings → Providers"
            assert row["display_name"] == "Vulpy Cloud"
            assert row["has_key"] is True
            assert row["configurable"] is True
            # The card is NOT a plugin-only provider card — it is a
            # registered static provider with a key-manageable entry.
            assert row.get("is_plugin_provider") is False
            assert row["key_source"] == "env_file"
        finally:
            _restore_config(old_cfg, old_mtime)

    def test_get_providers_uses_profile_fallback_models_and_labels(self, monkeypatch, tmp_path):
        """Live discovery off → profile fallback_models + model_labels."""
        _install_fake_vulpy_plugin(monkeypatch)
        _install_fake_hermes_cli(monkeypatch, model_ids=[])
        old_cfg, old_mtime = _reset_config(monkeypatch, tmp_path)
        try:
            from api.providers import get_providers

            result = get_providers()
            row = next((p for p in result["providers"] if p["id"] == "vulpy"), None)
            assert row is not None
            assert row["configurable"] is True
            models = row.get("models") or []
            ids = [m.get("id") for m in models]
            assert "vulpy-default" in ids
            assert "vulpy-image" in ids
            assert row["models_total"] == len(models) == 8
            labels = {m.get("id"): m.get("label") for m in models}
            # Friendly aliases win; ids without labels keep the id.
            assert labels.get("vulpy-default") == "DeepSeek V4 Flash"
            assert labels.get("vulpy-embed") == "vulpy-embed"
        finally:
            _restore_config(old_cfg, old_mtime)

    def test_get_providers_prefers_live_catalog_with_labels(self, monkeypatch, tmp_path):
        """Live discovery on → live catalog + profile labels applied."""
        _install_fake_vulpy_plugin(monkeypatch)
        _install_fake_hermes_cli(
            monkeypatch,
            model_ids=["vulpy-default", "vulpy-smart", "vulpy-embed"],
        )
        old_cfg, old_mtime = _reset_config(monkeypatch, tmp_path)
        try:
            from api.providers import get_providers

            result = get_providers()
            row = next((p for p in result["providers"] if p["id"] == "vulpy"), None)
            assert row is not None
            models = row.get("models") or []
            ids = [m.get("id") for m in models]
            assert ids == ["vulpy-default", "vulpy-smart", "vulpy-embed"]
            assert row["models_total"] == 3
            labels = {m.get("id"): m.get("label") for m in models}
            assert labels.get("vulpy-default") == "DeepSeek V4 Flash"
            assert labels.get("vulpy-smart") == "Claude Sonnet 4"
        finally:
            _restore_config(old_cfg, old_mtime)

    def test_set_provider_key_writes_vulpy_api_key(self, monkeypatch, tmp_path):
        """Saving a Vulpy key writes only VULPY_API_KEY via the safe .env writer."""
        _install_fake_vulpy_plugin(monkeypatch)
        old_cfg, old_mtime = _reset_config(monkeypatch, tmp_path)
        try:
            from api.providers import set_provider_key

            result = set_provider_key("vulpy", "test-vulpy-key-abcdef")
            assert result["ok"] is True
            env_text = (tmp_path / ".env").read_text(encoding="utf-8")
            assert "VULPY_API_KEY=test-vulpy-key-abcdef" in env_text
            assert "OPENAI_API_KEY=" not in env_text
            assert "VULPY_BASE_URL=" not in env_text
        finally:
            _restore_config(old_cfg, old_mtime)

    def test_registered_profile_not_plugin_only(self, monkeypatch):
        """A profile-backed provider with env vars is configurable without becoming plugin-only."""
        _install_fake_vulpy_plugin(monkeypatch)
        from api.plugin_providers import (
            is_plugin_model_provider,
            plugin_model_provider_ids,
            registered_model_provider_ids,
        )

        assert is_plugin_model_provider("vulpy") is False
        assert "vulpy" not in plugin_model_provider_ids()
        assert "vulpy" in registered_model_provider_ids()


# Keep a reference so unittest-style collection finds nothing unexpected here.
class _NotAClass:
    pass