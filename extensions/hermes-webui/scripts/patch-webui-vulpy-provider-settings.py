#!/usr/bin/env python3
"""
Patch hermes-webui: make Vulpy Cloud a registered, manageable provider.

WebUI's Settings → Providers panel hides a provider card unless it is
configurable, OAuth, custom, plugin-only, or self-hosted.  Vulpy Cloud is a
bundled model-provider plugin profile registered via list_providers(), so the
FIXED assets below (builder "f" = full) are writable through the same
patch-anchor pattern the other WebUI patches use.

The classic plugin-only gate (is_plugin_model_provider) deliberately EXCLUDES
providers that appear in the WebUI static tables: `vulpy` was added to
_PROVIDER_DISPLAY by patch-webui-vulpy-display-name.py, so the plugin
discovery path is suppressed and the provider's profile env var + live/fallback
models never surface.  This patcher adds a SEPARATE "registered provider
profile" concept that does NOT depend on plugin-only semantics:

  1. api/plugin_providers.py: registered-profile helpers
     - registered_model_provider_ids(): every list_providers() slug (minus
       the synthetic "custom") regardless of WebUI static membership
     - registered_model_provider_profile(): lookup one profile
     - registered_model_provider_fallback_models(): profile.fallback_models
     - registered_model_provider_model_ids(): live catalog via hermes_cli
     - registered_model_provider_model_labels(): profile.model_labels
     - registered_model_provider_env_key(): primary API-key env var for a
       registered profile (skips _BASE_URL/_URL/_FOLDER_ID and every
       OAuth-style auth_type)
  2. api/providers.py:
     - in _provider_env_var_for(): after the static _PROVIDER_ENV_VAR map,
       fall back to the provider profile's declared primary env var via
       registered_model_provider_env_key() — the static map stays the sole
       source of VULPY_API_KEY metadata, and the registered profile is
       consulted only when the map has no entry
     - in get_providers(): for registered providers NOT in _PROVIDER_MODELS,
       populate models from the live Hermes catalog, falling back to the
       provider profile's fallback_models, and apply profile.model_labels.
       The existing plugin-only model branch is untouched.

Design rules (patch-webui-vulpy-display-name.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0 per surface.
  - Applies to FRESH api/config.py (providers.py is patched; plugin_providers
    helpers are appended after an existing stable function).
  - Static provider env mappings are NEVER overridden: the registered-profile
    env key is only consulted when the static map has no entry.

Usage: python3 patch-webui-vulpy-provider-settings.py /path/to/api/providers.py /path/to/api/plugin_providers.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-webui-provider-settings"

# ── api/plugin_providers.py: append helpers after the env-var helper ────────
PLUGIN_PROVIDERS_ANCHOR = '''def plugin_model_provider_api_key_env_var(provider_id: str) -> str | None:
    """Return the primary API-key env var for a plugin provider, if any."""
    profile = plugin_model_provider_profiles().get((provider_id or "").strip().lower())
    if profile is None:
        return None
    env_vars = getattr(profile, "env_vars", ()) or ()
    for var in env_vars:
        upper = str(var).upper()
        if upper.endswith("_BASE_URL") or upper.endswith("_URL"):
            continue
        if upper.endswith("_FOLDER_ID"):
            continue
        return str(var)
    return None'''

PLUGIN_PROVIDERS_REPLACEMENT = PLUGIN_PROVIDERS_ANCHOR + '''


# vulpy-webui-provider-settings: registered-provider-profile helpers.
#
# ``is_plugin_model_provider()`` deliberately means PLUGIN-ONLY: slugs that
# appear in WebUI static tables (_PROVIDER_DISPLAY / _PROVIDER_MODELS) are
# excluded so bundled agent profiles never hijack the static/custom paths.
# A provider can ALSO be a REGISTERED PROFILE (bundled project plugin shipped
# via Dockerfile) even when it is WebUI-static — that's exactly the Vulpy
# Cloud case.  The helpers below answer "registered provider profile" without
# touching plugin-only semantics, so a registered profile may coexist with
# static WebUI display data.
def registered_model_provider_ids() -> frozenset[str]:
    """Slugs of every registered model-provider profile (minus \"custom\")."""
    return frozenset(
        pid
        for pid in plugin_model_provider_profiles().keys()
        if pid != "custom"
    )


def registered_model_provider_profile(provider_id: str) -> Any | None:
    """Return the registered profile for *provider_id*, or None."""
    return plugin_model_provider_profiles().get((provider_id or "").strip().lower())


def registered_model_provider_fallback_models(provider_id: str) -> list[str]:
    """Return the registered profile's fallback model IDs, if any."""
    profile = registered_model_provider_profile(provider_id)
    if profile is None:
        return []
    fallback = getattr(profile, "fallback_models", None) or ()
    result: list[str] = []
    for mid in fallback:
        mid_s = str(mid or "").strip()
        if mid_s and mid_s not in result:
            result.append(mid_s)
    return result


def registered_model_provider_model_ids(provider_id: str) -> list[str]:
    """Live model IDs for a registered profile via Hermes CLI, or []."""
    pid = (provider_id or "").strip().lower()
    if pid not in registered_model_provider_ids():
        return []
    try:
        from hermes_cli.models import provider_model_ids as _provider_model_ids
    except Exception:
        return []
    try:
        live_ids = _provider_model_ids(pid) or []
    except Exception:
        return []
    result: list[str] = []
    seen: set[str] = set()
    for mid in live_ids:
        mid_s = str(mid or "").strip()
        if mid_s and mid_s not in seen:
            seen.add(mid_s)
            result.append(mid_s)
    return result


def registered_model_provider_model_labels(provider_id: str) -> dict[str, str]:
    """Return per-model display labels from a registered profile.

    Profiles may attach a ``model_labels`` mapping (alias -> friendly name)
    for the WebUI picker; the gateway's OpenAI-shaped /v1/models listing only
    carries ids, so labels live in the provider plugin.
    """
    profile = registered_model_provider_profile(provider_id)
    if profile is None:
        return {}
    labels = getattr(profile, "model_labels", None) or {}
    return {str(k): str(v) for k, v in labels.items() if str(k) and str(v)}


def registered_model_provider_env_key(provider_id: str) -> str | None:
    """Return the primary API-key env var for a registered profile, if any.

    Only consulted when the WebUI static _PROVIDER_ENV_VAR map has no entry,
    so deliberate static mappings are never overridden.  Every OAuth-style
    profile (declared via ``auth_type``: oauth, token, oauth_device_code,
    oauth_external, oauth_copilot, copilot, external_process, aws_sdk,
    vertex, oauth_minimax, ...) is skipped — those credentials are managed
    by the CLI, not via an API key in .env.
    """
    profile = registered_model_provider_profile(provider_id)
    if profile is None:
        return None
    auth_type = str(getattr(profile, "auth_type", "") or "").strip().lower()
    if auth_type and (
        "oauth" in auth_type
        or auth_type
        in (
            "token",
            "copilot",
            "external_process",
            "aws_sdk",
            "vertex",
        )
    ):
        return None
    env_vars = getattr(profile, "env_vars", ()) or ()
    for var in env_vars:
        upper = str(var).upper()
        if upper.endswith("_BASE_URL") or upper.endswith("_URL"):
            continue
        if upper.endswith("_FOLDER_ID"):
            continue
        return str(var)
    return None'''


# ── api/providers.py: env-var resolution via registered profile ─────────────
CONFIG_PROVIDER_ENV_FN_ANCHOR = '''def _provider_env_var_for(provider_id: str) -> str | None:
    """Resolve the API-key env var for a provider (static table + plugin profiles)."""
    return effective_provider_env_var(provider_id, _PROVIDER_ENV_VAR)
'''

CONFIG_PROVIDER_ENV_FN_REPLACEMENT = '''def _provider_env_var_for(provider_id: str) -> str | None:
    """Resolve the API-key env var for a provider (static table + plugin profiles)."""
    resolved = effective_provider_env_var(provider_id, _PROVIDER_ENV_VAR)
    if resolved:
        return resolved
    # vulpy-webui-provider-settings: a REGISTERED provider profile (Vulpy Cloud)
    # has a declared primary API-key env var even when it also appears in the
    # WebUI static tables.  Consult that profile when the static map has no
    # entry; the static map always wins to preserve deliberate mappings.
    # OAuth-style profiles are already excluded by the helper.
    try:
        from api.plugin_providers import (
            registered_model_provider_env_key as _registered_provider_env_key,
        )

        return _registered_provider_env_key(provider_id)
    except Exception:
        return None
'''

# ── api/providers.py: get_providers() registered-profile model branch ───────
CONFIG_GET_PROVIDERS_BRANCH_ANCHOR = '''            except Exception:
                logger.debug(
                    "Failed to load plugin model-provider catalog for %s",
                    pid,
                    exc_info=True,
                )
        # Also include models from config.yaml providers section'''

CONFIG_GET_PROVIDERS_BRANCH_REPLACEMENT = '''            except Exception:
                logger.debug(
                    "Failed to load plugin model-provider catalog for %s",
                    pid,
                    exc_info=True,
                )
        # vulpy-webui-provider-settings: registered provider profiles (Vulpy
        # Cloud) are WebUI-static AND registry-backed. They are excluded from
        # the plugin-only branch above (is_plugin_model_provider), so surface
        # their live profile catalog here. When live discovery fails, fall
        # back to the provider profile's fallback_models (the profile owns the
        # authoritative list — never duplicate it in WebUI). Apply
        # profile.model_labels where present.
        if pid not in _PROVIDER_MODELS:
            _registered_ids = registered_model_provider_ids()
            if pid in _registered_ids:
                _reg_live = _models_from_live_provider_ids(
                    pid,
                    registered_model_provider_model_ids(pid),
                )
                if _reg_live:
                    models = _reg_live
                    models_total = len(models)
                else:
                    _reg_fallback = registered_model_provider_fallback_models(pid)
                    if _reg_fallback:
                        models = [
                            {"id": mid, "label": mid} for mid in _reg_fallback
                        ]
                        models_total = len(models)
                _reg_labels = registered_model_provider_model_labels(pid)
                if _reg_labels:
                    _labeled = []
                    for _m in models:
                        if not isinstance(_m, dict):
                            continue
                        _mid = str(_m.get("id") or "").strip()
                        if not _mid:
                            continue
                        _labeled.append(
                            {
                                "id": _mid,
                                "label": _reg_labels.get(
                                    _mid,
                                    str(_m.get("label") or _mid),
                                ),
                            }
                        )
                    models = _labeled
        # Also include models from config.yaml providers section'''


# ── api/providers.py: imports for the helpers above ─────────────────────────
CONFIG_IMPORTS_ANCHOR = """from api.plugin_providers import (
    effective_provider_display_name,
    effective_provider_env_var,
    is_plugin_model_provider,
    plugin_model_provider_ids,
)"""

CONFIG_IMPORTS_REPLACEMENT = """from api.plugin_providers import (
    effective_provider_display_name,
    effective_provider_env_var,
    is_plugin_model_provider,
    plugin_model_provider_ids,
    registered_model_provider_fallback_models,
    registered_model_provider_ids,
    registered_model_provider_model_ids,
    registered_model_provider_model_labels,
)"""


def _patch_once(path, anchor, replacement, label) -> bool:
    """Apply *replacement* for *anchor* once; returns True when applied."""
    with open(path) as f:
        src = f.read()
    n = src.count(anchor)
    if n != 1:
        print(
            "ERROR: anchor '%s' appears %d times (expected 1):\\n"
            "  File: %s\\n"
            "  hermes-webui source changed shape -- update\\n"
            "  extensions/hermes-webui/scripts/patch-webui-vulpy-provider-settings.py"
            % (label, n, path),
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(anchor, replacement, 1)
    with open(path, "w") as f:
        f.write(src)
    print("Patched [%s] %s" % (label, path))
    return True


def main() -> None:
    if len(sys.argv) != 3:
        print(
            f"Usage: {sys.argv[0]} /path/to/api/providers.py /path/to/api/plugin_providers.py",
            file=sys.stderr,
        )
        sys.exit(1)

    providers_path, plugin_providers_path = sys.argv[1], sys.argv[2]

    # ── plugin_providers.py: append registered-profile helpers ──────────────
    with open(plugin_providers_path) as f:
        pp_src = f.read()
    if IDEMPOTENCY_MARK in pp_src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {plugin_providers_path})")
    else:
        n = pp_src.count(PLUGIN_PROVIDERS_ANCHOR)
        if n != 1:
            print(
                "ERROR: anchor 'plugin-providers' appears %d times (expected 1):\\n"
                "  File: %s\\n"
                "  hermes-webui source changed shape -- update\\n"
                "  extensions/hermes-webui/scripts/patch-webui-vulpy-provider-settings.py"
                % (n, plugin_providers_path),
                file=sys.stderr,
            )
            sys.exit(1)
        pp_src = pp_src.replace(PLUGIN_PROVIDERS_ANCHOR, PLUGIN_PROVIDERS_REPLACEMENT, 1)
        with open(plugin_providers_path, "w") as f:
            f.write(pp_src)
        print(f"Patched [plugin-providers] {plugin_providers_path}")

    # ── providers.py: idempotent whole-file guard ───────────────────────────
    with open(providers_path) as f:
        p_src = f.read()
    if IDEMPOTENCY_MARK in p_src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {providers_path})")
        return

    for anchor, replacement, label in (
        (CONFIG_PROVIDER_ENV_FN_ANCHOR, CONFIG_PROVIDER_ENV_FN_REPLACEMENT, "config-provider-env-fn"),
        (CONFIG_GET_PROVIDERS_BRANCH_ANCHOR, CONFIG_GET_PROVIDERS_BRANCH_REPLACEMENT, "config-get-providers-branch"),
        (CONFIG_IMPORTS_ANCHOR, CONFIG_IMPORTS_REPLACEMENT, "config-imports"),
    ):
        _patch_once(providers_path, anchor, replacement, label)


if __name__ == "__main__":
    main()