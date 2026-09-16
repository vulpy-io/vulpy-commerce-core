"""Regression test: POST /api/models/refresh stays generic and invalidates
the provider/full catalog cache for a registered static profile (vulpy).

The existing POST /api/models/refresh endpoint calls
``api.config.invalidate_provider_models_cache(provider_id)``.  For Vulpy this
must clear the provider + full catalog cache so a subsequent model/provider
read rebuilds with the CURRENT profile catalog (no Vulpy-only endpoint).
"""

from __future__ import annotations

import sys
import types
from types import SimpleNamespace

import api.config as config
from api.plugin_providers import invalidate_plugin_model_provider_cache


def _install_fake_vulpy_plugin(monkeypatch):
    profile = SimpleNamespace(
        name="vulpy",
        display_name="Vulpy Cloud",
        env_vars=("VULPY_API_KEY", "VULPY_BASE_URL", "OPENAI_API_KEY"),
        auth_type="api_key",
        fallback_models=("vulpy-default", "vulpy-image"),
        model_labels={"vulpy-default": "DeepSeek V4 Flash"},
    )

    def _fake_list_providers():
        return [profile]

    fake_providers = types.ModuleType("providers")
    fake_providers.list_providers = _fake_list_providers
    monkeypatch.setitem(sys.modules, "providers", fake_providers)
    invalidate_plugin_model_provider_cache()


def _install_fake_hermes_cli(monkeypatch, model_ids):
    fake_pkg = types.ModuleType("hermes_cli")
    fake_pkg.__path__ = []
    fake_models = types.ModuleType("hermes_cli.models")
    fake_models.provider_model_ids = lambda pid: list(model_ids) if pid == "vulpy" else []
    monkeypatch.setitem(sys.modules, "hermes_cli", fake_pkg)
    monkeypatch.setitem(sys.modules, "hermes_cli.models", fake_models)


class TestRefreshInvalidatesVulpyProviderCatalog:
    def test_refresh_invalidates_provider_and_full_cache(self, monkeypatch):
        _install_fake_vulpy_plugin(monkeypatch)
        # Catalyst returns no live models -> refresh must not cache a stale list.
        _install_fake_hermes_cli(monkeypatch, model_ids=[])

        old_cfg = dict(config.cfg)
        old_mtime = config._cfg_mtime
        config.cfg.clear()
        config.cfg["model"] = {"provider": "vulpy", "default": "vulpy-default"}
        try:
            config._cfg_mtime = config.Path(config._get_config_path()).stat().st_mtime
        except Exception:
            config._cfg_mtime = 0.0
        try:
            # The generic refresh endpoint delegates to this function.
            from api.config import invalidate_provider_models_cache

            invalidate_provider_models_cache("vulpy")
            # caches must be cleared
            assert config._available_models_cache is None
            # A fresh full-catalog read must be able to rebuild with the
            # current profile catalog (fallback models when live is empty).
            from api.providers import get_providers

            result = get_providers()
            row = next((p for p in result["providers"] if p["id"] == "vulpy"), None)
            assert row is not None
            models = row.get("models") or []
            ids = [m.get("id") for m in models]
            assert "vulpy-default" in ids
        finally:
            config.cfg.clear()
            config.cfg.update(old_cfg)
            config._cfg_mtime = old_mtime
            config.invalidate_models_cache()