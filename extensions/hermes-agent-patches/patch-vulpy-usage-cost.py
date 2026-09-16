#!/usr/bin/env python3
"""Build-time patcher: carry the Vulpy gateway's reported ``usage.cost`` through
Hermes' session cost accounting so the WebUI shows REAL per-call spend.

Why: the Vulpy LLM gateway (``https://gateway.vulpy.io``) returns an exact
per-call cost in the chat-completions ``usage`` object (``usage.cost`` USD,
plus ``usage.cost_details``).  Hermes currently discards it:

  * ``agent/transports/chat_completions.py`` builds ``Usage(prompt_tokens,
    completion_tokens, total_tokens)`` — the SDK preserves ``cost`` in
    ``usage.model_extra`` but the transport drops it.
  * ``agent/usage_pricing.py::normalize_usage()`` only extracts token buckets,
    never cost.
  * ``agent/conversation_loop.py`` then estimates cost from models.dev-style
    pricing, which is unknown for the ``vulpy-*`` aliases -> session cost stays
    $0 and the WebUI cost badge / insights charts show nothing.

What: four exact-anchor source substitutions (fail-closed on any drift).

  1. ``agent/transports/types.py`` — ``Usage`` dataclass gains
     ``cost: Optional[float] = None`` (after existing defaults so no
     positional callers break).
  2. ``agent/transports/chat_completions.py`` — populate ``Usage.cost`` from
     the SDK-preserved ``usage.model_extra`` / ``__pydantic_extra__`` (or a
     bare ``cost`` attribute) so it survives response normalization.
  3. ``agent/usage_pricing.py`` — ``CanonicalUsage`` gains
     ``actual_cost_usd: Optional[float] = None`` and ``normalize_usage()``
     reads the same ``cost`` field (from any OpenAI-compatible raw usage
     object) into it.
  4. ``agent/conversation_loop.py`` — when ``actual_cost_usd`` is present on
     the canonical usage, prefer it over the models.dev-style estimate: add it
     to ``session_estimated_cost_usd``, set ``cost_status="actual"`` and
     ``cost_source="provider_generation_api"``, and pass ``actual_cost_usd``
     through to ``update_token_counts`` (the schema already has the column).

Explicitly NOT changed: gateway config, provider plugin, WebUI frontend — the
insights aggregation already prefers ``COALESCE(actual_cost_usd,
estimated_cost_usd)`` and the badge reads the session cost field.

Fail-closed: every anchor must match exactly once, else exit 1 (upstream drift
must break the image build, not silently regress to $0).  Idempotent: a second
run prints "already patched" and exits 0 without re-applying.

Usage: python3 patch-vulpy-usage-cost.py /app/hermes-agent  (repo root)
"""

from __future__ import annotations

import sys
from typing import List, Tuple

IDEMPOTENCY_MARK = "# Vulpy gateway usage.cost passthrough (vulpy patch)"

# ── 1. agent/transports/types.py — Usage dataclass gains cost ──────────────
TYPES_OLD = (
    "    prompt_tokens: int = 0\n"
    "    completion_tokens: int = 0\n"
    "    total_tokens: int = 0\n"
    "    cached_tokens: int = 0\n"
)
TYPES_NEW = TYPES_OLD + (
    "    # Vulpy gateway usage.cost passthrough (vulpy patch): the LiteLLM\n"
    "    # gateway returns exact per-call USD spend in usage.cost.  Stored here\n"
    "    # so the agent loop can record ACTUAL cost instead of a models.dev\n"
    "    # estimate.  None for providers that do not report cost.\n"
    "    cost: Optional[float] = None\n"
)

# ── 2. agent/transports/chat_completions.py — populate Usage.cost ──────────
CHAT_COMPLETIONS_OLD = (
    "            usage = Usage(\n"
    "                prompt_tokens=getattr(u, \"prompt_tokens\", 0) or 0,\n"
    "                completion_tokens=getattr(u, \"completion_tokens\", 0) or 0,\n"
    "                total_tokens=getattr(u, \"total_tokens\", 0) or 0,\n"
    "            )\n"
)
CHAT_COMPLETIONS_NEW = (
    "            usage = Usage(\n"
    "                prompt_tokens=getattr(u, \"prompt_tokens\", 0) or 0,\n"
    "                completion_tokens=getattr(u, \"completion_tokens\", 0) or 0,\n"
    "                total_tokens=getattr(u, \"total_tokens\", 0) or 0,\n"
    "                # Vulpy gateway usage.cost passthrough (vulpy patch): the\n"
    "                # SDK preserves unknown fields in model_extra.  Prefer a\n"
    "                # first-class attr, then model_extra/__pydantic_extra__.\n"
    "                cost=_usage_cost(u),\n"
    "            )\n"
)

# Helper inserted above the transport class (exact anchor: the module docstring
# ends right before `from __future__`... actually it ends before the imports;
# anchor on the import block instead so the helper lands before the class).
HELPER_OLD = (
    "from agent.transports.types import NormalizedResponse, ToolCall, Usage\n"
)
HELPER_NEW = (
    "from agent.transports.types import NormalizedResponse, ToolCall, Usage\n"
    "\n"
    "\n"
    "def _usage_cost(u: Any) -> Any:\n"
    "    \"\"\"Return the exact per-call USD cost reported by an OpenAI-compatible\n"
    "    gateway, or None when absent.\n"
    "\n"
    "    The LiteLLM gateway (Vulpy) returns ``cost`` inside the usage object;\n"
    "    the OpenAI SDK preserves unknown fields in ``model_extra`` (a.k.a.\n"
    "    ``__pydantic_extra__``).  Read those before falling back to a bare\n"
    "    attribute so the value survives response normalization.\n"
    "    \"\"\"\n"
    "    if u is None:\n"
    "        return None\n"
    "    for attr in (\"cost\",):\n"
    "        try:\n"
    "            val = getattr(u, attr, None)\n"
    "        except Exception:\n"
    "            val = None\n"
    "        if val is not None:\n"
    "            try:\n"
    "                return float(val)\n"
    "            except (TypeError, ValueError):\n"
    "                return None\n"
    "    for extra_attr in (\"model_extra\", \"__pydantic_extra__\"):\n"
    "        extra = getattr(u, extra_attr, None) or {}\n"
    "        if isinstance(extra, dict) and extra.get(\"cost\") is not None:\n"
    "            try:\n"
    "                return float(extra[\"cost\"])\n"
    "            except (TypeError, ValueError):\n"
    "                return None\n"
    "    return None\n"
)

# ── 3. agent/usage_pricing.py — CanonicalUsage.actual_cost_usd ─────────────
USAGE_PRICING_USAGE_OLD = (
    "    reasoning_tokens: int = 0\n"
    "    request_count: int = 1\n"
    "    raw_usage: Optional[dict[str, Any]] = None\n"
)
USAGE_PRICING_USAGE_NEW = USAGE_PRICING_USAGE_OLD + (
    "    # Vulpy gateway usage.cost passthrough (vulpy patch): exact per-call\n"
    "    # USD spend reported by the gateway (LiteLLM).  None when the provider\n"
    "    # does not report cost.\n"
    "    actual_cost_usd: Optional[float] = None\n"
)

USAGE_PRICING_NORM_OLD = (
    "    return CanonicalUsage(\n"
    "        input_tokens=input_tokens,\n"
    "        output_tokens=output_tokens,\n"
    "        cache_read_tokens=cache_read_tokens,\n"
    "        cache_write_tokens=cache_write_tokens,\n"
    "        reasoning_tokens=reasoning_tokens,\n"
    "    )\n"
)
USAGE_PRICING_NORM_NEW = (
    "    return CanonicalUsage(\n"
    "        input_tokens=input_tokens,\n"
    "        output_tokens=output_tokens,\n"
    "        cache_read_tokens=cache_read_tokens,\n"
    "        cache_write_tokens=cache_write_tokens,\n"
    "        reasoning_tokens=reasoning_tokens,\n"
    "        # Vulpy gateway usage.cost passthrough (vulpy patch): carry the\n"
    "        # exact per-call USD cost reported by the gateway.  Handles both\n"
    "        # the SDK attr and the model_extra dict the SDK preserves it in.\n"
    "        actual_cost_usd=_raw_usage_cost(response_usage),\n"
    "    )\n"
)

USAGE_PRICING_HELPER_OLD = (
    "def _to_decimal(value: Any) -> Optional[Decimal]:\n"
)
USAGE_PRICING_HELPER_NEW = (
    "def _raw_usage_cost(response_usage: Any) -> Optional[float]:\n"
    "    \"\"\"Return exact per-call USD cost from a raw OpenAI-compatible usage\n"
    "    object, or None when absent.\"\"\"\n"
    "    if response_usage is None:\n"
    "        return None\n"
    "    for attr in (\"cost\",):\n"
    "        try:\n"
    "            val = getattr(response_usage, attr, None)\n"
    "        except Exception:\n"
    "            val = None\n"
    "        if val is not None:\n"
    "            try:\n"
    "                return float(val)\n"
    "            except (TypeError, ValueError):\n"
    "                return None\n"
    "    for extra_attr in (\"model_extra\", \"__pydantic_extra__\"):\n"
    "        extra = getattr(response_usage, extra_attr, None) or {}\n"
    "        if isinstance(extra, dict) and extra.get(\"cost\") is not None:\n"
    "            try:\n"
    "                return float(extra[\"cost\"])\n"
    "            except (TypeError, ValueError):\n"
    "                return None\n"
    "    return None\n"
    "\n"
    "\n"
    "def _to_decimal(value: Any) -> Optional[Decimal]:\n"
)

# ── 4. agent/conversation_loop.py — prefer actual cost over estimate ────────
CONV_LOOP_OLD = (
    "                    cost_result = estimate_usage_cost(\n"
    "                        _agg_cost_model,\n"
    "                        aggregator_usage,\n"
    "                        provider=_agg_cost_provider,\n"
    "                        base_url=_agg_cost_base_url,\n"
    "                        api_key=getattr(agent, \"api_key\", \"\"),\n"
    "                    )\n"
    "                    if cost_result.amount_usd is not None:\n"
    "                        agent.session_estimated_cost_usd += float(cost_result.amount_usd)\n"
)
CONV_LOOP_NEW = (
    "                    cost_result = estimate_usage_cost(\n"
    "                        _agg_cost_model,\n"
    "                        aggregator_usage,\n"
    "                        provider=_agg_cost_provider,\n"
    "                        base_url=_agg_cost_base_url,\n"
    "                        api_key=getattr(agent, \"api_key\", \"\"),\n"
    "                    )\n"
    "                    # Vulpy gateway usage.cost passthrough (vulpy patch):\n"
    "                    # when the gateway reported an exact per-call cost,\n"
    "                    # prefer it over the models.dev-style estimate (which is\n"
    "                    # unknown for vulpy-* aliases and would zero out the\n"
    "                    # session cost).\n"
    "                    _actual_cost = canonical_usage.actual_cost_usd\n"
    "                    if _actual_cost is not None:\n"
    "                        agent.session_estimated_cost_usd += float(_actual_cost)\n"
    "                        cost_result = CostResult(\n"
    "                            amount_usd=Decimal(str(_actual_cost)),\n"
    "                            status=\"actual\",\n"
    "                            source=\"provider_generation_api\",\n"
    "                            label=f\"${_actual_cost:.4f}\",\n"
    "                        )\n"
    "                    elif cost_result.amount_usd is not None:\n"
    "                        agent.session_estimated_cost_usd += float(cost_result.amount_usd)\n"
)

# conversation_loop uses Decimal/CostResult — ensure imports exist (they do via
# usage_pricing import; keep the block self-contained with a local import guard).
CONV_LOOP_IMPORT_OLD = (
    "from agent.usage_pricing import estimate_usage_cost, normalize_usage\n"
)
CONV_LOOP_IMPORT_NEW = (
    "from agent.usage_pricing import estimate_usage_cost, normalize_usage\n"
    "from agent.usage_pricing import CostResult  # Vulpy usage.cost passthrough (vulpy patch)\n"
    "from decimal import Decimal  # Vulpy usage.cost passthrough (vulpy patch)\n"
)

SUBSTITUTIONS: List[Tuple[str, str, str, str]] = [
    ("types.py Usage cost field", "agent/transports/types.py", TYPES_OLD, TYPES_NEW),
    ("chat_completions.py helper", "agent/transports/chat_completions.py", HELPER_OLD, HELPER_NEW),
    ("chat_completions.py populate Usage.cost", "agent/transports/chat_completions.py", CHAT_COMPLETIONS_OLD, CHAT_COMPLETIONS_NEW),
    ("usage_pricing.py CanonicalUsage field", "agent/usage_pricing.py", USAGE_PRICING_USAGE_OLD, USAGE_PRICING_USAGE_NEW),
    ("usage_pricing.py _raw_usage_cost helper", "agent/usage_pricing.py", USAGE_PRICING_HELPER_OLD, USAGE_PRICING_HELPER_NEW),
    ("usage_pricing.py normalize_usage returns cost", "agent/usage_pricing.py", USAGE_PRICING_NORM_OLD, USAGE_PRICING_NORM_NEW),
    ("conversation_loop.py imports", "agent/conversation_loop.py", CONV_LOOP_IMPORT_OLD, CONV_LOOP_IMPORT_NEW),
    ("conversation_loop.py prefer actual cost", "agent/conversation_loop.py", CONV_LOOP_OLD, CONV_LOOP_NEW),
]


def apply_text(src: str, file_key: str) -> str:
    """Return the patched source; raise SystemExit on drift (fail-closed)."""
    if IDEMPOTENCY_MARK in src:
        return src
    for label, key, old, new in SUBSTITUTIONS:
        if key != file_key:
            continue
        count = src.count(old)
        if count != 1:
            raise SystemExit(
                "anchor mismatch (%d found, 1 expected) for %s: %r\n"
                "  File: %s\n"
                "  hermes-agent changed shape -- update\n"
                "  extensions/hermes-agent-patches/patch-vulpy-usage-cost.py"
                % (count, label, old[:80], file_key)
            )
        src = src.replace(old, new, 1)
    return src


def apply(root: str) -> int:
    """Patch the four files under ``root``.  0 = success/idempotent, 1 = drift."""
    targets = [
        "agent/transports/types.py",
        "agent/transports/chat_completions.py",
        "agent/usage_pricing.py",
        "agent/conversation_loop.py",
    ]
    for rel in targets:
        path = f"{root.rstrip('/')}/{rel}"
        try:
            with open(path, encoding="utf-8") as f:
                src = f.read()
        except OSError as exc:
            print(f"[vulpy-cost] FATAL: cannot read {path}: {exc}", file=sys.stderr)
            return 1

        if IDEMPOTENCY_MARK in src:
            print(f"[vulpy-cost] Already patched ({IDEMPOTENCY_MARK} found in {path})")
            continue

        for label, key, old, new in SUBSTITUTIONS:
            if key != rel:
                continue
            count = src.count(old)
            if count != 1:
                print(
                    "anchor mismatch (%d found, 1 expected) for %s: %r\n"
                    "  File: %s\n"
                    "  hermes-agent changed shape -- update\n"
                    "  extensions/hermes-agent-patches/patch-vulpy-usage-cost.py"
                    % (count, label, old[:80], path),
                    file=sys.stderr,
                )
                return 1
            src = src.replace(old, new, 1)

        try:
            compile(src, path, "exec")
        except SyntaxError as exc:
            print(f"[vulpy-cost] FATAL: patched source does not compile: {exc}", file=sys.stderr)
            return 1

        with open(path, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"[vulpy-cost] patched {rel}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/hermes-agent", file=sys.stderr)
        sys.exit(1)
    sys.exit(apply(sys.argv[1]))
