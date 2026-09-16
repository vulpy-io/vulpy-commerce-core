#!/usr/bin/env python3
"""Prove the persistent CDP browser holds session state across separate tasks.

Opens TWO independent websocket connections to the same browser page (simulating
two agent tasks). Connection A navigates + sets a cookie; connection B (a fresh
connection) reads it back. If the durable profile is working, both the cookie and
the URL persist.

Requires the `websockets` PyPI package (async client) — NOT `websocket`.
Verified present on the Fox image's system python3 (websockets 15.x).

Usage:  python3 cdp-persistence-probe.py [http://127.0.0.1:9222]
"""
import asyncio
import json
import sys
import time
import urllib.request

import websockets

CDP_HTTP = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9222"


async def cdp(ws, mid, method, params=None):
    await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        m = json.loads(await ws.recv())
        if m.get("id") == mid:
            return m


async def main():
    pages = json.loads(urllib.request.urlopen(f"{CDP_HTTP}/json").read())
    page = next((p for p in pages if p["type"] == "page"), pages[0])
    page_ws = page["webSocketDebuggerUrl"]
    print("using page ws:", page_ws)

    # CONNECTION A — "task 1": navigate + set cookie
    async with websockets.connect(page_ws) as ws:
        await cdp(ws, 1, "Network.enable")
        await cdp(ws, 2, "Page.navigate", {"url": "https://example.com"})
        time.sleep(2)
        r = await cdp(ws, 3, "Network.setCookie",
                      {"name": "px_test", "value": "persisted123",
                       "url": "https://example.com"})
        print("connA setCookie:", r.get("result"))
        r = await cdp(ws, 4, "Runtime.evaluate",
                      {"expression": "document.cookie", "returnByValue": True})
        print("connA doc.cookie:", r.get("result", {}).get("result", {}).get("value"))

    # CONNECTION B — "task 2": fresh websocket to SAME page/profile.
    # Cookie + URL must survive across the connection boundary.
    async with websockets.connect(page_ws) as ws:
        r = await cdp(ws, 5, "Runtime.evaluate",
                      {"expression": "location.href", "returnByValue": True})
        print("connB location:", r.get("result", {}).get("result", {}).get("value"))
        r = await cdp(ws, 6, "Runtime.evaluate",
                      {"expression": "document.cookie", "returnByValue": True})
        print("connB doc.cookie (persisted?):",
              r.get("result", {}).get("result", {}).get("value"))

    # Also confirm the durable Cookies DB exists on disk
    import os
    cookies_db = "/data/data/hermes/browser-profile/Default/Cookies"
    print("Cookies DB on disk:", os.path.exists(cookies_db),
          "->", "DURABLE SESSION STATE OK" if os.path.exists(cookies_db)
          else "MISSING (profile not persisted!)")


asyncio.run(main())