#!/usr/bin/env python3
"""Patch mem0_oss plugin: native Vulpy gateway and explicit-write support.

Adds `vulpy` as a first-class provider for the mem0_oss memory plugin:

  * `vulpy` maps to the OpenAI-compatible adapter (the Vulpy LLM gateway
    speaks the OpenAI wire protocol).
  * Provider defaults: LLM = `vulpy-default` (extraction), embedder =
    `vulpy-embed` (titan-embed-text-v2 behind the gateway alias), 1024 dims.
  * When provider=vulpy, endpoint/credentials resolve from the shared Vulpy
    chain (VULPY_API_KEY / VULPY_BASE_URL env) instead of bespoke aux config,
    so mem0 rides the same credential boundary as every other client.
  * Per-provider LLM/embedder defaults are read directly from the provider's
    own table entry (behavior-preserving for all legacy providers).
  * Explicit writes use ``infer=False`` and validate Mem0's persisted result;
    automatic extraction falls back to the same direct write when empty.

Usage: python3 patch-mem0-oss-vulpy-gateway.py <path-to-plugins/memory/mem0_oss/__init__.py>
"""
import sys

IDEMPOTENCY_MARK = "mem0_oss: explicit write fallback (vulpy patch)"

HELPER_ANCHOR = "logger = logging.getLogger(__name__)\n"
HELPER_REPLACEMENT = """logger = logging.getLogger(__name__)
# mem0_oss: explicit write fallback (vulpy patch)


def _memory_write_succeeded(result: Any) -> bool:
    \"\"\"Return whether mem0 confirmed at least one persisted result.\"\"\"
    if isinstance(result, dict):
        result = result.get(\"results\")
    return bool(result)
"""

SYNC_ANCHOR = """            mem = self._get_memory()
            mem.add(messages=messages, user_id=self._user_id, infer=True)
            del mem  # release Qdrant lock ASAP
            self._record_success()
"""
SYNC_REPLACEMENT = """            mem = self._get_memory()
            result = mem.add(messages=messages, user_id=self._user_id, infer=True)
            if not _memory_write_succeeded(result):
                logger.debug("mem0_oss: extraction returned no facts; retrying as explicit write")
                result = mem.add(messages=messages, user_id=self._user_id, infer=False)
            del mem  # release Qdrant lock ASAP
            if not _memory_write_succeeded(result):
                raise RuntimeError("mem0_oss write did not persist any results")
            self._record_success()
"""

ADD_ANCHOR = """            mem = self._get_memory()
            mem.add(
                messages=[{"role": "user", "content": content}],
                user_id=self._user_id,
                infer=True,
            )
            del mem  # release Qdrant lock ASAP
            self._record_success()
            return json.dumps({"result": "Memory stored successfully."})
"""
ADD_REPLACEMENT = """            mem = self._get_memory()
            result = mem.add(
                messages=[{"role": "user", "content": content}],
                user_id=self._user_id,
                infer=False,
            )
            del mem  # release Qdrant lock ASAP
            if not _memory_write_succeeded(result):
                raise RuntimeError("mem0_oss write did not persist any results")
            self._record_success()
            return json.dumps({"result": "Memory stored successfully."})
"""


def apply_behavioral_patches(src: str) -> str:
    """Patch explicit and automatic writes with persistence validation."""
    if IDEMPOTENCY_MARK in src:
        return src
    for label, old, new in (
        ("helper", HELPER_ANCHOR, HELPER_REPLACEMENT),
        ("sync_turn", SYNC_ANCHOR, SYNC_REPLACEMENT),
        ("explicit_add", ADD_ANCHOR, ADD_REPLACEMENT),
    ):
        count = src.count(old)
        if count != 1:
            raise SystemExit(
                f"anchor mismatch ({count} found, 1 expected) for {label}: {old[:70]!r}"
            )
        src = src.replace(old, new, 1)
    return src


def apply(path: str) -> int:
    src = open(path).read()
    if IDEMPOTENCY_MARK in src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {path})")
        return 0

    # The provider portion may already have been applied by the preceding
    # qdrant/provider image patch.  Apply the behavioral patch independently so
    # upgrades do not require replaying stale provider anchors.
    if 'or "vulpy"' in src:
        src = apply_behavioral_patches(src)
        compile(src, path, "exec")
        open(path, "w").write(src)
        print(f"Patched explicit-write fallback in {path}")
        print("syntax OK")
        return 0

    n_patches = 0

    def sub(old: str, new: str, expect: int = 1) -> None:
        nonlocal src, n_patches
        count = src.count(old)
        if count != expect:
            raise SystemExit(
                f"anchor mismatch ({count} found, {expect} expected): {old[:70]!r}"
            )
        src = src.replace(old, new)
        n_patches += 1

    # 1) Docstring: document the vulpy provider option.
    sub(
        '''  provider   — Hermes provider name: "auto", "aws_bedrock", "bedrock",
               "openai", "openrouter", "ollama", "anthropic", or "custom".''',
        '''  provider   — Hermes provider name: "auto", "aws_bedrock", "bedrock",
               "openai", "openrouter", "ollama", "anthropic", "custom",
               or "vulpy" (Vulpy LLM gateway — OpenAI-compatible).''',
    )

    # 2) Provider map: vulpy → OpenAI-compatible adapter.
    sub(
        '''    "custom": "openai",       # custom base_url → OpenAI-compatible adapter''',
        '''    "custom": "openai",       # custom base_url → OpenAI-compatible adapter
    "vulpy": "openai",        # Vulpy LLM gateway → OpenAI-compatible adapter''',
    )

    # 3) Provider defaults row: extraction LLM + embedder alias + dims.
    sub(
        '''    "openrouter":   ("openai/gpt-4o-mini", "openai", "text-embedding-3-small", 1536),''',
        '''    "openrouter":   ("openai/gpt-4o-mini", "openai", "text-embedding-3-small", 1536),
    "vulpy":        ("vulpy-default",      "openai", "vulpy-embed",           1024),''',
    )

    # 4) _load_config: replace the provider/model resolution block.
    #    - vulpy credential resolution from the shared Vulpy chain
    #    - raw provider name kept for direct table lookups (LLM model AND
    #      embedder defaults), replacing the legacy helper round-trip
    sub(
        '''    # LLM provider: env > aux config > auto-detected > default
    default_llm_provider = aux_provider or auto_provider or "openai"
    llm_provider = os.environ.get("MEM0_OSS_LLM_PROVIDER", default_llm_provider).strip()
    # Normalise Hermes provider aliases → mem0 provider keys
    llm_provider = _normalise_provider(llm_provider)

    # LLM model: env > aux config > auto-detected > per-provider default
    default_llm_model = aux_model or auto_model or _default_model_for(llm_provider)
    llm_model = os.environ.get("MEM0_OSS_LLM_MODEL", default_llm_model).strip()

    # Embedder defaults mirror the LLM provider
    default_emb_provider = _default_embedder_provider(llm_provider)
    default_emb_model = _default_embedder_model(default_emb_provider)
    default_emb_dims = _default_embedder_dims(default_emb_provider)''',
        '''    # LLM provider: env > aux config > auto-detected > default
    default_llm_provider = aux_provider or auto_provider or "openai"
    llm_provider = os.environ.get("MEM0_OSS_LLM_PROVIDER", default_llm_provider).strip()

    # Vulpy gateway: resolve endpoint/credentials from the shared Vulpy
    # provider chain (env-first, then Hermes auth registry) so no bespoke
    # aux config is required.
    if llm_provider.strip().lower() == "vulpy":
        resolved_api_key = (
            resolved_api_key
            or os.environ.get("VULPY_API_KEY", "").strip()
        )
        if not resolved_api_key:
            try:
                from hermes_cli.auth import resolve_api_key_provider_credentials
                _creds = resolve_api_key_provider_credentials("vulpy")
                resolved_api_key = str(_creds.get("api_key", "") or "").strip()
            except Exception:
                pass
        resolved_base_url = (
            resolved_base_url
            or os.environ.get("VULPY_BASE_URL", "").strip()
            or "https://gateway.vulpy.io/v1"
        )

    # Keep the un-normalised name for provider-table lookups below.
    raw_provider = llm_provider
    # Normalise Hermes provider aliases → mem0 provider keys
    llm_provider = _normalise_provider(llm_provider)

    if raw_provider in _PROVIDER_DEFAULTS:
        (_default_llm_model, _emb_p,
         _emb_m, _emb_d) = _PROVIDER_DEFAULTS[raw_provider]
    else:
        _default_llm_model = _default_model_for(llm_provider)
        _emb_p = _default_embedder_provider(llm_provider)
        _emb_m = _default_embedder_model(_emb_p)
        _emb_d = _default_embedder_dims(_emb_p)

    # LLM model: env > aux config > auto-detected > per-provider default
    default_llm_model = aux_model or auto_model or _default_llm_model
    llm_model = os.environ.get("MEM0_OSS_LLM_MODEL", default_llm_model).strip()

    # Embedder defaults mirror the LLM provider
    default_emb_provider = _emb_p
    default_emb_model = _emb_m
    default_emb_dims = _emb_d''',
    )

    src = apply_behavioral_patches(src)
    src = src.replace(
        "# mem0_oss: qdrant server support (vulpy patch)",
        "# mem0_oss: qdrant server support (vulpy patch)\n# " + IDEMPOTENCY_MARK,
        1,
    )

    open(path, "w").write(src)
    print(f"OK: {n_patches} patches applied to {path}")
    compile(src, path, "exec")
    print("syntax OK")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sys.exit(apply(sys.argv[1]))
