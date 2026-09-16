#!/usr/bin/env python3
"""Patch WebUI api/routes.py: raise the extension sidecar proxy size cap.

The extension sidecar proxy buffers the WHOLE upstream response before
forwarding, capped at ``_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES = 512 KiB``
(``_read_extension_sidecar_proxy_body`` reads MAX+1 bytes and raises ValueError
"Extension sidecar response too large" past the cap, and the handler returns
502 with that JSON body).

512 KiB is too small for the message-renderer extension's session polls:
``GET /api/sessions/{id}/messages?limit=40`` returns full message bodies, and
a heavy pre-compaction transcript easily exceeds it (observed 2026-08-14: a
126K-token session polled 502 "Extension sidecar response too large" until
compaction shrank the same poll to 215 KiB). The WebUI already buffers the
body in memory, so an 8 MiB default is harmless; an env override
(HERMES_WEBUI_SIDECAR_MAX_RESPONSE_BYTES) tunes it without a rebuild.

Rules (patch-webui-sidecar-proxy-sse-stream.py pattern):
  - Fail LOUDLY (exit 1) when the anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH hermes-webui files (same shape as the live ones used as
    reference on 2026-08-14).

Usage:
  python3 patch-webui-sidecar-proxy-max-response.py /app/hermes-webui/api/routes.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-sidecar-proxy-max-response"
ANCHOR = "_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES = 512 * 1024"
NEW = (
    "# vulpy-sidecar-proxy-max-response: the extension sidecar proxy buffers\n"
    "# whole upstream responses; 512 KiB was too small for message-renderer\n"
    "# session polls (heavy transcripts -> 502 \"Extension sidecar response\n"
    "# too large\"). Default 8 MiB; HERMES_WEBUI_SIDECAR_MAX_RESPONSE_BYTES\n"
    "# overrides without a rebuild (garbage values fall back to the default).\n"
    "_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES = 8 * 1024 * 1024\n"
    "try:\n"
    "    _EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES = int(\n"
    "        os.environ.get(\n"
    "            \"HERMES_WEBUI_SIDECAR_MAX_RESPONSE_BYTES\",\n"
    "            str(_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES),\n"
    "        )\n"
    "    )\n"
    "except (TypeError, ValueError):\n"
    "    pass\n"
)


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: python3 {sys.argv[0]} /app/hermes-webui/api/routes.py", file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"already patched — sidecar proxy max response bytes present ({path})")
        return

    n = src.count(ANCHOR)
    if n != 1:
        print(
            f"ERROR: anchor appears {n} times (expected 1):\n"
            f"  anchor: {ANCHOR!r}\n"
            f"  File: {path}\n"
            "  Hermes WebUI changed shape — update "
            "extensions/hermes-webui/scripts/patch-webui-sidecar-proxy-max-response.py",
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(ANCHOR, NEW, 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: sidecar proxy max response 512 KiB -> 8 MiB (env-overridable) -> {path}")


if __name__ == "__main__":
    main()
