#!/usr/bin/env python3
"""
Patch hermes-webui: surface friendly per-model labels from provider plugins.

The gateway's /v1/models listing is OpenAI-shaped (id only), so the model
picker labels the vulpy aliases with their raw ids.  Provider profiles can
carry a ``model_labels`` mapping (alias -> friendly name) — this patch wires
it through:

  1. api/plugin_providers.py: add ``plugin_model_provider_model_labels()``
     that reads ``profile.model_labels`` from the registered plugin.
  2. api/config.py: import the helper and apply labels to the model group
     right before it is appended for plugin providers.

Fail-loud: every anchor must match exactly once, else exit 1.
Idempotent: re-run prints "already patched", exit 0.

Usage: python3 patch-webui-vulpy-model-labels.py /path/to/api/config.py /path/to/api/plugin_providers.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-webui-model-labels"

# ── api/plugin_providers.py ──────────────────────────────────────────────────
PROVIDERS_ANCHOR = '''def plugin_model_provider_api_key_env_var(provider_id: str) -> str | None:
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

PROVIDERS_REPLACEMENT = PROVIDERS_ANCHOR + '''


# vulpy-webui-model-labels: friendly per-model labels from provider plugins.
def plugin_model_provider_model_labels(provider_id: str) -> dict[str, str]:
    """Return per-model display labels from a plugin provider profile.

    Profiles may attach a ``model_labels`` mapping (alias -> friendly name)
    for the WebUI picker; the gateway's OpenAI-shaped /v1/models listing only
    carries ids, so labels live in the provider plugin.
    """
    profile = plugin_model_provider_profiles().get((provider_id or "").strip().lower())
    if profile is None:
        return {}
    labels = getattr(profile, "model_labels", None) or {}
    return {str(k): str(v) for k, v in labels.items() if str(k) and str(v)}'''

# ── api/config.py: import ────────────────────────────────────────────────────
CONFIG_IMPORT_ANCHOR = """from api.plugin_providers import (
    effective_provider_display_name as _effective_provider_display_name,
    is_plugin_model_provider as _is_plugin_model_provider,
)"""

CONFIG_IMPORT_REPLACEMENT = """from api.plugin_providers import (
    effective_provider_display_name as _effective_provider_display_name,
    is_plugin_model_provider as _is_plugin_model_provider,
    plugin_model_provider_model_labels as _plugin_model_provider_model_labels,
)"""

# ── api/config.py: apply labels in the plugin-provider group branch ─────────
CONFIG_GROUP_ANCHOR = """                    detected_models = auto_detected_models_by_provider.get(pid, [])
                    if detected_models and not raw_models:
                        raw_models = copy.deepcopy(detected_models)
                    _append_picker_group(provider_name, pid, raw_models)"""

CONFIG_GROUP_REPLACEMENT = """                    detected_models = auto_detected_models_by_provider.get(pid, [])
                    if detected_models and not raw_models:
                        raw_models = copy.deepcopy(detected_models)
                    # vulpy-webui-model-labels: surface friendly per-model
                    # labels from the provider plugin (profile.model_labels)
                    # when present — e.g. "DeepSeek V4 Flash" instead of the
                    # raw gateway alias in the picker.
                    _plugin_labels = _plugin_model_provider_model_labels(pid)
                    if _plugin_labels:
                        _labeled = []
                        for _m in raw_models:
                            if not isinstance(_m, dict):
                                continue
                            _mid = str(_m.get("id") or "").strip()
                            if not _mid:
                                continue
                            _labeled.append(
                                {
                                    "id": _mid,
                                    "label": _plugin_labels.get(_mid, str(_m.get("label") or _mid)),
                                }
                            )
                        raw_models = _labeled
                    _append_picker_group(provider_name, pid, raw_models)"""


def main() -> None:
    if len(sys.argv) != 3:
        print(
            f"Usage: {sys.argv[0]} /path/to/api/config.py /path/to/api/plugin_providers.py",
            file=sys.stderr,
        )
        sys.exit(1)

    config_path, providers_path = sys.argv[1], sys.argv[2]

    # plugin_providers.py first (config.py import depends on the helper).
    with open(providers_path) as f:
        p_src = f.read()
    if IDEMPOTENCY_MARK in p_src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {providers_path})")
    else:
        n = p_src.count(PROVIDERS_ANCHOR)
        if n != 1:
            print(
                "ERROR: anchor 'providers' appears %d times (expected 1):\n"
                "  File: %s\n"
                "  hermes-webui source changed shape -- update\n"
                "  extensions/hermes-webui/scripts/patch-webui-vulpy-model-labels.py"
                % (n, providers_path),
                file=sys.stderr,
            )
            sys.exit(1)
        p_src = p_src.replace(PROVIDERS_ANCHOR, PROVIDERS_REPLACEMENT, 1)
        with open(providers_path, "w") as f:
            f.write(p_src)
        print(f"Patched [providers] {providers_path}")

    # config.py: skip if already marked.
    with open(config_path) as f:
        c_src = f.read()
    if IDEMPOTENCY_MARK in c_src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {config_path})")
        return
    n = c_src.count(CONFIG_IMPORT_ANCHOR)
    if n != 1:
        print(
            "ERROR: anchor 'config-import' appears %d times (expected 1):\n"
            "  File: %s\n"
            "  hermes-webui source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-webui-vulpy-model-labels.py"
            % (n, config_path),
            file=sys.stderr,
        )
        sys.exit(1)
    n = c_src.count(CONFIG_GROUP_ANCHOR)
    if n != 1:
        print(
            "ERROR: anchor 'config-group' appears %d times (expected 1):\n"
            "  File: %s\n"
            "  hermes-webui source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-webui-vulpy-model-labels.py"
            % (n, config_path),
            file=sys.stderr,
        )
        sys.exit(1)
    c_src = c_src.replace(CONFIG_IMPORT_ANCHOR, CONFIG_IMPORT_REPLACEMENT, 1)
    c_src = c_src.replace(CONFIG_GROUP_ANCHOR, CONFIG_GROUP_REPLACEMENT, 1)
    with open(config_path, "w") as f:
        f.write(c_src)
    print(f"Patched [config] {config_path}")


if __name__ == "__main__":
    main()
