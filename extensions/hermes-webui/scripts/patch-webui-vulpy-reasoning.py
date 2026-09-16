#!/usr/bin/env python3
"""
Patch hermes-webui api/config.py: register reasoning support for Vulpy models.

The Vulpy LLM gateway routes ``vulpy-*`` aliases to DeepSeek V4 Flash,
Claude Sonnet 4, and Kimi K3 — all reasoning-capable.  But the WebUI's
``resolve_model_reasoning_efforts()`` doesn't know about ``vulpy`` as a
provider, so the heuristic fallback returns ``[]`` and the reasoning-effort
chip never appears in the composer.

This patch adds a ``vulpy`` provider check to ``_heuristic_reasoning_efforts()``
so all ``vulpy-*`` models expose the full reasoning effort set.

Rules (patch-webui-vulpy-display-name.py pattern):
  - Fail LOUDLY (exit 1) when the anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH api/config.py.

Usage: python3 patch-webui-vulpy-reasoning.py /path/to/api/config.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-webui-reasoning"

# Anchor: the nested-gateway check right before the _candidate_supports_reasoning
# fallback in _heuristic_reasoning_efforts().
ANCHOR = """    if _nested_gateway_route_reasoning(model):
        return list(VALID_REASONING_EFFORTS)
    # Named custom providers often rewrite model ids"""

REPLACEMENT = """    if _nested_gateway_route_reasoning(model):
        return list(VALID_REASONING_EFFORTS)
    # vulpy-webui-reasoning: the Vulpy gateway routes vulpy-* aliases to
    # reasoning-capable backends (DeepSeek V4 Flash, Claude Sonnet 4, Kimi
    # K3).  Expose the full reasoning-effort set for all vulpy models.
    if provider == "vulpy":
        return list(VALID_REASONING_EFFORTS)
    # Named custom providers often rewrite model ids"""


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/api/config.py", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {path})")
        return

    n = src.count(ANCHOR)
    if n != 1:
        print(
            "ERROR: anchor for '%s' appears %d times (expected 1):\n"
            "  File: %s\n"
            "  hermes-webui source changed shape -- update\n"
            "  extensions/hermes-webui/scripts/patch-webui-vulpy-reasoning.py"
            % (IDEMPOTENCY_MARK, n, path),
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(ANCHOR, REPLACEMENT, 1)
    with open(path, "w") as f:
        f.write(src)

    print(f"Patched {path} ({IDEMPOTENCY_MARK})")


if __name__ == "__main__":
    main()