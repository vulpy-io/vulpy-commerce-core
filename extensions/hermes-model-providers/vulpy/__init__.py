"""Vulpy Commerce LLM gateway provider profile.

Vulpy's LiteLLM gateway fronts multiple upstream backends (DeepSeek V4 Flash
on GMI/Novita, GLM via Nous, Kimi K3) behind stable alias names
(``vulpy-default``, ``vulpy-coder``, ``vulpy-designer``, ``vulpy-writer``,
``vulpy-vision``, ``vulpy-cutting-edge``). Each alias maps to a different upstream with a
different completion-token ceiling, so this profile overrides
:meth:`get_max_tokens` to return the per-model output cap instead of a single
static value.

Without a registered profile, Hermes treats Vulpy as an unregistered
``openai-api`` custom provider, which has no ``default_max_tokens`` and no
endpoint-metadata read for the output budget — so ``max_tokens`` falls back to
the bare 4096 default. With reasoning ON at high effort, DeepSeek burns that
budget on thinking and truncates the answer (the "message part, then
[System: truncated], then another broken part" symptom). Registering a profile
fixes the root cause: the profile path resolves ``max_tokens`` from
``get_max_tokens(model)`` automatically.

.. note::

   The compressor's **input-window reservation** is a separate concern from the
   API-level ``max_tokens`` output cap. DeepSeek V4 Flash and Kimi K3 have
   independent input/output budgets, so the compressor must NOT reserve output
   tokens from the input window. The entrypoint script
   ``hermes-fox-entrypoint.sh`` sets ``model.max_tokens: ''`` at boot to
   signal "no reservation" — see ``vulpy_ensure_model_max_tokens()``.
"""

from __future__ import annotations

from providers import register_provider
from providers.base import ProviderProfile

# Per-alias output ceilings, keyed by the alias model name the gateway
# advertises. These must match the REAL upstream the alias routes to, not a
# sibling provider's catalog. Verified 2026-08-21.
# The US gateway (gateway.vulpy.io) routes default/coder through OpenRouter,
# which supports full 1M input / 393216+ output for DeepSeek V4 Flash.
# Nous-routed GLM-5.2 (writer/designer) and GLM-5.3 Flash (vision) support
# the same 393216 output ceiling as the primary DeepSeek aliases.
_VULPY_OUTPUT_CAPS = {
    # Public stable aliases.
    "vulpy-default": 393216,            # OpenRouter DeepSeek V4 Flash
    "vulpy-coder": 393216,             # OpenRouter DeepSeek V4 Flash
    "vulpy-designer": 393216,          # Nous GLM-5.2
    "vulpy-writer": 393216,            # Nous GLM-5.2
    "vulpy-writer-backup": 393216,     # OpenRouter DeepSeek V4 Flash
    "vulpy-vision": 393216,            # Nous GLM-5.3 Flash
    "vulpy-cutting-edge": 1048576,     # OpenRouter Kimi K3 (Novita backend)
    "vulpy-cutting-edge-novita": 1048576,  # Novita Kimi K3
    # Operational aliases — hidden from public listing but still routable.
    "vulpy-baseten-deepseek": 384000,
    "vulpy-gmi-deepseek": 393216,
    "vulpy-default-ds": 393216,
    "vulpy-default-backup": 64000,     # Bedrock Claude
    "vulpy-coder-novita": 393216,
    "vulpy-coder-ds": 393216,
    "vulpy-coder-backup": 64000,       # Bedrock Claude
}

# Generous floor for any alias not enumerated above — never truncate on the
# bare 4096 default. Users can override per-model via model.max_tokens.
_VULPY_DEFAULT_MAX_TOKENS = 65536

# Friendly picker labels for the PUBLIC aliases. The gateway's /v1/models
# listing is OpenAI-shaped (id only), so the WebUI consumes these via
# plugin_model_provider_model_labels() (wired by
# patch-webui-vulpy-model-labels.py at image build time). Labels are the
# Vulpy alias names prettified — NOT the underlying provider/model names
# (the shop exposes Vulpy models, not raw DeepSeek/Claude/Kimi).
_VULPY_MODEL_LABELS = {
    "vulpy-default": "Vulpy Default",
    "vulpy-coder": "Vulpy Coder",
    "vulpy-designer": "Vulpy Designer",
    "vulpy-writer": "Vulpy Writer",
    "vulpy-vision": "Vulpy Vision",
    "vulpy-designer": "Vulpy Designer",
    "vulpy-cutting-edge": "Vulpy Cutting Edge",
    "vulpy-image": "Vulpy Image",
}


class VulpyProfile(ProviderProfile):
    """Vulpy LLM gateway — per-alias output caps."""

    def get_max_tokens(self, model: str | None) -> int | None:
        """Return the output cap for *model* (the gateway alias name)."""
        m = (model or "").strip().lower()
        if m in _VULPY_OUTPUT_CAPS:
            return _VULPY_OUTPUT_CAPS[m]
        return self.default_max_tokens


vulpy = VulpyProfile(
    name="vulpy",
    aliases=("vulpy-gateway", "vulpy-commerce"),
    display_name="Vulpy Cloud",
    description="Vulpy Commerce LLM gateway — LiteLLM proxy fronting DeepSeek, Bedrock Claude, and Kimi",
    # VULPY_BASE_URL activates the standard per-environment endpoint override
    # (same pattern as OPENAI_BASE_URL / GMI_BASE_URL): hermes_cli/auth.py's
    # plugin→registry bridge detects the *_BASE_URL suffix in env_vars and
    # honors os.getenv("VULPY_BASE_URL") when resolving credentials. Without
    # it, credential resolution falls back to the hardcoded prod base_url
    # below — which breaks live /v1/models discovery on any box whose
    # VULPY_API_KEY belongs to a different environment (staging keys 401 on
    # prod). Symptom was the WebUI model dropdown losing the "Vulpy Cloud"
    # group entirely (empty catalog → group dropped).
    #
    # OPENAI_API_KEY is deliberately NOT a credential source here (removed
    # 2026-09-10). Registering it made the vulpy provider resolve against an
    # unrelated OpenAI key — and on the Fox box that env var held a stale,
    # exhausted gateway key ("fox-gateway", $200/$200 spent), so traffic
    # silently 429'd on BudgetExceededError. The vulpy provider must resolve
    # from VULPY_API_KEY only.
    env_vars=("VULPY_API_KEY", "VULPY_BASE_URL"),
    base_url="https://gateway.vulpy.io",
    auth_type="api_key",
    default_max_tokens=_VULPY_DEFAULT_MAX_TOKENS,
    # Safety net when the live fetch fails outright (gateway unreachable):
    # keeps the public aliases visible in the /model picker. Live discovery
    # wins whenever /v1/models responds.
    fallback_models=(
        "vulpy-default",
        "vulpy-coder",
        "vulpy-designer",
        "vulpy-writer",
        "vulpy-vision",
        "vulpy-cutting-edge",
        "vulpy-image",
    ),
)

register_provider(vulpy)

# Attach friendly picker labels (consumed by the WebUI via
# plugin_model_provider_model_labels — see patch-webui-vulpy-model-labels.py).
vulpy.model_labels = _VULPY_MODEL_LABELS
