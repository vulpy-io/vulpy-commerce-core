#!/usr/bin/env python3
"""
Patch hermes-webui api/config.py: register the Vulpy provider display name.

The vulpy provider group in the model picker is built from the gateway's
/v1/models advertisement (probed for the model.provider entry in
config.yaml).  Depending on the catalog path, the group label falls back to
``pid.replace("-", " ").title()`` = "Vulpy" when the plugin discovery path
is not consulted.  Add the canonical display name to ``_PROVIDER_DISPLAY``
so EVERY builder (static and plugin-aware) renders "Vulpy Cloud".

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when the anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH api/config.py.

Usage: python3 patch-webui-vulpy-display-name.py /path/to/api/config.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-webui-display-name"

ANCHOR = """_PROVIDER_DISPLAY = {
    "nous": "Nous Portal","""

REPLACEMENT = """_PROVIDER_DISPLAY = {
    # vulpy-webui-display-name: canonical display name for the Vulpy Cloud
    # LLM gateway provider group (vulpy model-provider plugin).
    "vulpy": "Vulpy Cloud",
    "nous": "Nous Portal","""


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
            "  extensions/hermes-webui/scripts/patch-webui-vulpy-display-name.py"
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
