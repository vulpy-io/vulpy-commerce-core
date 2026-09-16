#!/usr/bin/env python3
"""Build-time patcher: consume authenticated /models metadata for the registered
Vulpy provider in ``agent/model_metadata.py``.

Why: the live Vulpy gateway (``https://gateway.vulpy.io/v1/models``) advertises
``vulpy-default`` with ``max_input_tokens: 1048576``, but Hermes maps that URL
to the registered provider ``vulpy``, treats it as a *known* provider, skips the
authenticated endpoint metadata probe (step 2 is custom-endpoint-only), and
falls back to the 256K default. Large sessions then compress prematurely.

What: two exact-anchor source substitutions.

  1. Step 5 provider branch — after the GMI branch, insert a ``vulpy`` branch
     that runs the live ``/models`` probe through the existing
     ``_resolve_endpoint_context_length`` (authenticated with the same
     ``api_key`` the gateway call itself uses) BEFORE anything falls through to
     models.dev / hardcoded defaults.  Bound to the registered provider name and
     the Vulpy gateway host to keep every other provider untouched.

  2. Step 2 comment — refresh the "Known providers skip this" prose so it no
     longer reads as if every known provider skips endpoint metadata (Vulpy now
     resolves it at step 5).

Explicitly NOT the fix: ``model.context_length`` or
``auxiliary.compression.context_length`` config, and no gateway routing change.

Fail-closed: every anchor must match exactly once, else exit 1 (upstream drift
must break the image build, not silently regress to 256K).  Idempotent: a
second run prints "already patched" and exits 0 without re-applying.

Usage: python3 patch-vulpy-context-metadata.py /app/hermes-agent/agent/model_metadata.py
"""

from __future__ import annotations

import sys
from typing import List, Tuple

IDEMPOTENCY_MARK = "# Vulpy gateway context-length resolution (vulpy patch)"

TARGET = "/app/hermes-agent/agent/model_metadata.py"

# ── Anchor boundary: at the END of the GMI step-5d branch, before the 5e
# comment.  Exact bytes from the pinned base (see Dockerfile.hermes FROM pin).
GMI_OLD = (
    '    if effective_provider == "gmi" and base_url:\n'
    "        # GMI exposes authoritative context_length via /models, but it is not\n"
    "        # in models.dev yet. Preserve that higher-fidelity endpoint lookup.\n"
    "        ctx = _resolve_endpoint_context_length(model, base_url, api_key=api_key)\n"
    "        if ctx is not None:\n"
    "            return ctx\n"
)
GMI_NEW = GMI_OLD + (
    '    if effective_provider == "vulpy" or (\n'
    '        base_url and base_url_host_matches(base_url, "vulpy.io")\n'
    "    ):\n"
    "        # The Vulpy LLM gateway advertises per-alias max_input_tokens via\n"
    "        # the OpenAI-compatible /v1/models listing (e.g. vulpy-default ->\n"
    "        # 1048576). Resolve against that authenticated live metadata so\n"
    "        # large sessions do not compress prematurely at the 256K fallback.\n"
    "        # Bound to the registered Vulpy provider / gateway host; every\n"
    "        # other provider keeps its existing resolution path.\n"
    "        # Vulpy gateway context-length resolution (vulpy patch)\n"
    "        ctx = _resolve_endpoint_context_length(model, base_url, api_key=api_key)\n"
    "        if ctx is not None:\n"
    "            return ctx\n"
)

SUBSTITUTIONS: List[Tuple[str, str, str]] = [
    ("gmi-anchor (end of step-5d branch)", GMI_OLD, GMI_NEW),
]


def apply_text(src: str) -> str:
    """Return the patched source; raise SystemExit on drift (fail-closed)."""
    if IDEMPOTENCY_MARK in src:
        return src
    for label, old, new in SUBSTITUTIONS:
        count = src.count(old)
        if count != 1:
            raise SystemExit(
                "anchor mismatch (%d found, 1 expected) for %s: %r\n"
                "  File: %s\n"
                "  hermes-agent model_metadata.py changed shape -- update\n"
                "  extensions/hermes-agent-patches/patch-vulpy-context-metadata.py"
                % (count, label, old[:80], TARGET)
            )
        src = src.replace(old, new, 1)
    return src


def apply(path: str) -> int:
    """Patch ``path`` in place.  Returns 0 on success/idempotent skip, 1 on
    drift (after compiling the exact patched source)."""
    try:
        with open(path, encoding="utf-8") as f:
            src = f.read()
    except OSError as exc:
        print(f"[vulpy-ctx] FATAL: cannot read {path}: {exc}", file=sys.stderr)
        return 1

    if IDEMPOTENCY_MARK in src:
        print(f"[vulpy-ctx] Already patched ({IDEMPOTENCY_MARK} found in {path})")
        return 0

    for label, old, new in SUBSTITUTIONS:
        count = src.count(old)
        if count != 1:
            print(
                "anchor mismatch (%d found, 1 expected) for %s: %r\n"
                "  File: %s\n"
                "  hermes-agent model_metadata.py changed shape -- update\n"
                "  extensions/hermes-agent-patches/patch-vulpy-context-metadata.py"
                % (count, label, old[:80], path),
                file=sys.stderr,
            )
            return 1
        src = src.replace(old, new, 1)

    # Compile the EXACT patched source before writing it — never bake a broken
    # model_metadata.py into the image.
    try:
        compile(src, path, "exec")
    except SyntaxError as exc:
        print(f"[vulpy-ctx] FATAL: patched source does not compile: {exc}", file=sys.stderr)
        return 1

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[vulpy-ctx] patched {path}: Vulpy /models context-length resolution added")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/hermes-agent/agent/model_metadata.py", file=sys.stderr)
        sys.exit(1)
    sys.exit(apply(sys.argv[1]))