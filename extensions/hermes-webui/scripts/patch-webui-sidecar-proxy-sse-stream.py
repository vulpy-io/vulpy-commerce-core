#!/usr/bin/env python3
"""Patch WebUI api/routes.py: restore a STREAMING path for the sidecar proxy.

The extension sidecar proxy is BUFFERED-ONLY: _read_extension_sidecar_proxy_body
reads the whole upstream body (up to 512KB+1) in one shot.  For an INFINITE SSE
stream (the assistant-ui pane's EventSource to /v1/runs/{id}/events) that read
blocks the handler thread until the 10s urllib timeout, then 502s — the pane
EventSource reconnects, each reconnect blocks another thread, and the WebUI
thread pool can be exhausted → page freeze.  SSE could never stream through it.

Fix: when the upstream responds with Content-Type: text/event-stream, take a
streaming pass-through instead of the buffered read:

  - headers forwarded through _connection_bound_header_names (hop-by-hop and
    connection-bound headers stripped, no Content-Length, no Set-Cookie)
  - handler.close_connection = True (the connection dies with the stream)
  - end_sse_headers(handler) — the module already imports it (routes.py:14),
    so HERMES_WEBUI_SSE_CHUNKED chunked framing keeps working through the proxy
  - 10s idle keep-waiting: the urllib socket timeout raises socket.timeout on a
    quiet read; we catch it and keep waiting, resetting the wait per chunk, so
    long-lived quiet streams (thinking, long tool runs) do not die

Non-SSE responses keep the existing buffered path untouched.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH hermes-webui files (verified against the pristine base
    on 2026-08-14).

Usage:
  python3 patch-webui-sidecar-proxy-sse-stream.py /app/hermes-webui/api/routes.py
"""

import sys

MARK = "vulpy-sidecar-proxy-sse-stream"

# Anchor 1: the buffered proxy open block (exact pristine shape).
ANCHOR_PROXY = "with opener.open(request, timeout=10) as response:"
OLD_PROXY = (
    "        with opener.open(request, timeout=10) as response:\n"
    "            body = _read_extension_sidecar_proxy_body(response)\n"
    "            return _send_extension_sidecar_proxy_response("
)
NEW_PROXY = (
    "        with opener.open(request, timeout=10) as response:\n"
    "            # vulpy-sidecar-proxy-sse-stream: text/event-stream upstreams\n"
    "            # get a streaming pass-through — the buffered read would block\n"
    "            # on an infinite SSE stream until the 10s timeout, then 502.\n"
    "            content_type = str(response.headers.get(\"Content-Type\", \"\")).lower()\n"
    "            if content_type.startswith(\"text/event-stream\"):\n"
    "                return _stream_extension_sidecar_proxy_sse(\n"
    "                    handler,\n"
    "                    getattr(response, \"status\", 200),\n"
    "                    response,\n"
    "                    response.headers,\n"
    "                )\n"
    "            body = _read_extension_sidecar_proxy_body(response)\n"
    "            return _send_extension_sidecar_proxy_response("
)

# Anchor 2: inject the streaming helper right before the buffered reader.
ANCHOR_HELPER = "def _read_extension_sidecar_proxy_body(stream) -> bytes:"
OLD_HELPER = "def _read_extension_sidecar_proxy_body(stream) -> bytes:"
NEW_HELPER = (
    "def _stream_extension_sidecar_proxy_sse(handler, status: int, stream, headers) -> bool:\n"
    "    \"\"\"Stream a text/event-stream upstream through the sidecar proxy.\n"
    "\n"
    "    The buffered path (_read_extension_sidecar_proxy_body) reads the WHOLE\n"
    "    body; on an infinite SSE stream that blocks the handler thread until\n"
    "    the 10s urllib timeout and 502s. Repeated EventSource reconnects can\n"
    "    exhaust the WebUI thread pool and freeze the page. SSE gets a\n"
    "    pass-through instead: connection-bound headers filtered, no\n"
    "    Content-Length, close_connection set, end_sse_headers() (so the\n"
    "    HERMES_WEBUI_SSE_CHUNKED framing option keeps working through the\n"
    "    proxy), and keep-waiting idle reads — the 10s socket timeout is caught\n"
    "    and the wait restarts per chunk, so long-lived quiet streams do not\n"
    "    die (defense in depth alongside the api_server 5s keep-alive).\n"
    "    \"\"\"\n"
    "    handler.send_response(status)\n"
    "    blocked_headers = _connection_bound_header_names(headers)\n"
    "    if headers and hasattr(headers, \"items\"):\n"
    "        for name, value in headers.items():\n"
    "            lower = str(name).lower()\n"
    "            if lower in blocked_headers or lower in {\"content-length\", \"set-cookie\"}:\n"
    "                continue\n"
    "            handler.send_header(str(name), str(value))\n"
    "    handler.close_connection = True\n"
    "    end_sse_headers(handler)\n"
    "    try:\n"
    "        while True:\n"
    "            try:\n"
    "                chunk = stream.read(4096)\n"
    "            except _socket.timeout:\n"
    "                # Idle window elapsed with no data — keep waiting. The\n"
    "                # socket timeout resets per chunk read, so long-lived\n"
    "                # streams survive quiet stretches.\n"
    "                continue\n"
    "            if not chunk:\n"
    "                break\n"
    "            try:\n"
    "                handler.wfile.write(chunk)\n"
    "                handler.wfile.flush()\n"
    "            except Exception:\n"
    "                # Client went away (tab closed / EventSource stopped) —\n"
    "                # stop reading; the upstream stream ends server-side.\n"
    "                break\n"
    "    finally:\n"
    "        try:\n"
    "            stream.close()\n"
    "        except Exception:\n"
    "            pass\n"
    "    return True\n"
    "\n"
    "\n"
    "def _read_extension_sidecar_proxy_body(stream) -> bytes:"
)


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def main() -> None:
    if len(sys.argv) != 2:
        print(
            f"Usage: python3 {sys.argv[0]} /app/hermes-webui/api/routes.py",
            file=sys.stderr,
        )
        sys.exit(1)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    if MARK in src:
        print(f"already patched — sidecar proxy SSE stream present ({path})")
        return

    for label, anchor, old, new in (
        ("sidecar proxy SSE gate", ANCHOR_PROXY, OLD_PROXY, NEW_PROXY),
        ("streaming helper", ANCHOR_HELPER, OLD_HELPER, NEW_HELPER),
    ):
        n = _count(src, anchor)
        if n != 1:
            print(
                f"ERROR: anchor for '{label}' appears {n} times (expected 1):\n"
                f"  anchor: {anchor[:120]!r}\n"
                f"  File: {path}\n"
                f"  Hermes changed shape — update "
                f"extensions/hermes-webui/scripts/patch-webui-sidecar-proxy-sse-stream.py",
                file=sys.stderr,
            )
            sys.exit(1)
        if old not in src:
            print(
                f"ERROR: old text for '{label}' not found in {path}\n"
                f"  old starts with: {old[:80]!r}",
                file=sys.stderr,
            )
            sys.exit(1)
        src = src.replace(old, new, 1)
        print(f"  applied: {label}")

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: sidecar proxy SSE stream -> {path}")


if __name__ == "__main__":
    main()
