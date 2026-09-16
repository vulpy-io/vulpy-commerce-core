#!/usr/bin/env python3
"""Patch WebUI routes.py: sidecar proxy treats idle SSE reads as keep-waiting.

The extension sidecar proxy opens upstream connections with a 10s read timeout
(`opener.open(request, timeout=10)`).  For streaming content
(`text/event-stream` / `application/x-ndjson`) the timeout applies to EVERY
`response.read()` in `_stream_extension_sidecar_proxy_response`, so a quiet
stretch >10s (agent thinking, long tool runs) raised `TimeoutError` inside the
read loop and the WebUI tore the SSE stream down — the assistant-ui pane froze
mid-turn while the host UI kept going.

This patch catches `TimeoutError` on the streaming read and continues waiting.
SSE streams legitimately go quiet; the upstream keep-alive comments (api_server
runs-events emits one every 5s after patch-api-server-runs-heartbeat.py) or the
next event arrive on their own schedule.  The buffered (non-streaming) path
keeps the 10s timeout — those responses are quick JSON.

Rules (patch-api-server-runs-fanout.py pattern):
  - Fail LOUDLY (exit 1) when the anchor is absent or appears more than once.
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage: python3 patch-webui-sidecar-proxy-sse-idle.py /path/to/routes.py
"""

import sys

IDEMPOTENCY_MARK = "SSE streams legitimately go quiet"


def apply(path: str) -> None:
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print("already patched — sidecar proxy keeps waiting on idle SSE reads")
        return

    anchor = "            chunk = response.read(chunk_size)"
    if src.count(anchor) != 1:
        print(
            f"ERROR: anchor appears {src.count(anchor)} times (expected 1):\n"
            f"  anchor: {anchor!r}\n"
            f"  File: {path}\n"
            "  Hermes WebUI routes.py changed shape — update "
            "extensions/hermes-webui/scripts/patch-webui-sidecar-proxy-sse-idle.py",
            file=sys.stderr,
        )
        sys.exit(1)

    old = (
        "    try:\n"
        "        while True:\n"
        "            chunk = response.read(chunk_size)\n"
        "            if not chunk:\n"
        "                break"
    )
    new = (
        "    try:\n"
        "        while True:\n"
        "            try:\n"
        "                chunk = response.read(chunk_size)\n"
        "            except TimeoutError:\n"
        "                # SSE streams legitimately go quiet (agent thinking, long tool\n"
        "                # runs). opener.open(..., timeout=10) applies the read timeout\n"
        "                # to every read; for event-stream content treat an idle read\n"
        "                # as \"keep waiting\" — the upstream keep-alive comments (or the\n"
        "                # next event) arrive on their own schedule.\n"
        "                continue\n"
        "            if not chunk:\n"
        "                break"
    )
    if old not in src:
        print(
            f"ERROR: old text not found for the SSE idle-read patch.\n"
            f"  old text starts with: {old[:80]!r}\n"
            f"  File: {path}",
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: sidecar proxy SSE idle-read keep-waiting applied to {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: patch-webui-sidecar-proxy-sse-idle.py /path/to/routes.py", file=sys.stderr)
        sys.exit(2)
    apply(sys.argv[1])
