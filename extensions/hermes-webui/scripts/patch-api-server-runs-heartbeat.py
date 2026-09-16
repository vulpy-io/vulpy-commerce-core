#!/usr/bin/env python3
"""Patch api_server.py: runs-events SSE keep-alive every 5s instead of 30s.

The WebUI sidecar proxy opens upstream connections with a 10s read timeout
(`opener.open(request, timeout=10)` in routes.py).  The api_server's run-events
SSE stream only wrote a keep-alive comment every 30s of idle, so any quiet
stretch >10s (agent thinking, long tool runs, model latency) made the proxy
raise `TimeoutError` inside `_read_chunked` and tear the stream down — the
assistant-ui pane froze mid-turn while the host UI kept going.

This patch lowers the keep-alive interval to 5s so a comment byte always
arrives before the proxy's 10s read timeout.  The proxy side is patched
separately by patch-webui-sidecar-proxy-sse-idle.py (idle reads = keep waiting,
not failure) — defense in depth against ANY intermediary with a short idle
timeout, not just the WebUI proxy.

Rules (patch-api-server-runs-fanout.py pattern):
  - Fail LOUDLY (exit 1) when the anchor is absent or appears more than once.
  - Idempotent: safe to run repeatedly on an already-patched file.
  - Handles BOTH shapes of _handle_run_events: the upstream single-consumer
    form (`q.get()`) and the fan-out-patched form (`my_q.get()`).

Usage: python3 patch-api-server-runs-heartbeat.py /path/to/api_server.py
"""

import sys

# Idempotency marks — presence of either means the patch is already applied.
MARKS = [
    "asyncio.wait_for(my_q.get(), timeout=5.0)",
    "asyncio.wait_for(q.get(), timeout=5.0)",
]

# (anchor, old, new, description) — anchor must appear exactly once.
PATCHES = [
    {
        "anchor": "event = await asyncio.wait_for(my_q.get(), timeout=30.0)",
        "old": (
            "                    event = await asyncio.wait_for(my_q.get(), timeout=30.0)\n"
            "                except asyncio.TimeoutError:\n"
            "                    await response.write(b\": keepalive\\n\\n\")"
        ),
        "new": (
            "                    event = await asyncio.wait_for(my_q.get(), timeout=5.0)\n"
            "                except asyncio.TimeoutError:\n"
            "                    # Keep-alive comment every 5s — below the WebUI sidecar\n"
            "                    # proxy's 10s read timeout, so idle stretches (thinking,\n"
            "                    # long tool runs) never look like a dead stream.\n"
            "                    await response.write(b\": keepalive\\n\\n\")"
        ),
        "description": "run-events keep-alive 30s → 5s (fan-out shape)",
    },
    {
        "anchor": "event = await asyncio.wait_for(q.get(), timeout=30.0)",
        "old": (
            "                    event = await asyncio.wait_for(q.get(), timeout=30.0)\n"
            "                except asyncio.TimeoutError:\n"
            "                    await response.write(b\": keepalive\\n\\n\")"
        ),
        "new": (
            "                    event = await asyncio.wait_for(q.get(), timeout=5.0)\n"
            "                except asyncio.TimeoutError:\n"
            "                    # Keep-alive comment every 5s — below the WebUI sidecar\n"
            "                    # proxy's 10s read timeout, so idle stretches (thinking,\n"
            "                    # long tool runs) never look like a dead stream.\n"
            "                    await response.write(b\": keepalive\\n\\n\")"
        ),
        "description": "run-events keep-alive 30s → 5s (upstream single-consumer shape)",
    },
]


def apply(path: str) -> None:
    with open(path) as f:
        src = f.read()

    # Idempotency: already patched → done.
    if any(mark in src for mark in MARKS):
        print("already patched — run-events keep-alive interval is 5s")
        return

    # Anchor validation: exactly one applicable patch.
    found = [p for p in PATCHES if p["anchor"] in src]
    if len(found) != 1:
        print(
            "ERROR: expected exactly one keep-alive anchor, found "
            f"{len(found)} (file: {path})",
            file=sys.stderr,
        )
        print(
            "ERROR: Hermes api_server.py changed shape — update "
            "extensions/hermes-webui/scripts/patch-api-server-runs-heartbeat.py",
            file=sys.stderr,
        )
        sys.exit(1)

    patch = found[0]
    if src.count(patch["anchor"]) != 1:
        print(
            f"ERROR: anchor appears {src.count(patch['anchor'])} times "
            f"(expected 1) for patch '{patch['description']}':\n"
            f"  anchor: {patch['anchor']!r}\n"
            f"  File: {path}\n"
            "  Cannot apply patch safely — update the patch script.",
            file=sys.stderr,
        )
        sys.exit(1)

    if patch["old"] not in src:
        print(
            f"ERROR: old text not found for patch '{patch['description']}'.\n"
            f"  old text starts with: {patch['old'][:80]!r}\n"
            f"  File: {path}",
            file=sys.stderr,
        )
        sys.exit(1)

    src = src.replace(patch["old"], patch["new"], 1)
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: {patch['description']} applied to {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: patch-api-server-runs-heartbeat.py /path/to/api_server.py", file=sys.stderr)
        sys.exit(2)
    apply(sys.argv[1])
