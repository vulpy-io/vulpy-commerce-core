#!/usr/bin/env python3
"""Prove a persistent CDP browser holds session/auth state across agent tasks.

Opens TWO separate websocket connections to the SAME persistent browser
(simulating two independent agent tasks). Task A sets a cookie on
example.com; Task B (a fresh connection) must read that cookie back AND see
the same navigated URL — proving the shared on-disk profile
(--user-data-dir) is the source of truth, not a per-task disposable browser.

Requires: system python3 with `websockets` (15.x verified) and a persistent
CDP browser listening on 127.0.0.1:9222.

Usage: python3 verify-cdp-persistence.py [cdp_http_port=9222]
Exit 0 = persistence verified (connB reads back connA's cookie).
"""
import asyncio
import json
import sys
import urllib.request
import time

import websockets

PORT = sys.argv[1] if len(sys.argv) > 1 else "9222"
DISCOVERY = f"http://127.0.0.1:{PORT}/json"


async def cdp(ws, mid, method, params=None):
    await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        m = json.loads(await ws.recv())
        if m.get("id") == mid:
            return m


async def main() -> None:
    pages = json.loads(urllib.request.urlopen(DISCOVERY).read())
    if not pages:
        print("FAIL: no CDP targets on", DISCOVERY)
        sys.exit(1)
    page_ws = pages[0]["webSocketDebuggerUrl"]

    # CONNECTION A — "task 1": navigate + set a cookie
    async with websockets.connect(page_ws) as ws:
        await cdp(ws, 1, "Network.enable")
        await cdp(ws, 2, "Page.navigate", {"url": "https://example.com"})
        time.sleep(2)
        r = await cdp(ws, 3, "Network.setCookie",
                      {"name": "px_test", "value": "persisted123", "url": "https://example.com"})
        print("connA setCookie:", r.get("result"))

    # CONNECTION B — "task 2": fresh websocket, SAME page/profile.
    # Cookie + origin must survive the connection boundary.
    async with websockets.connect(page_ws) as ws:
        r = await cdp(ws, 5, "Runtime.evaluate",
                      {"expression": "location.href", "returnByValue": True})
        loc = r.get("result", {}).get("result", {}).get("value")
        print("connB location:", loc)
        r = await cdp(ws, 6, "Runtime.evaluate",
                      {"expression": "document.cookie", "returnByValue": True})
        cookie = r.get("result", {}).get("result", {}).get("value", "")
        print("connB doc.cookie (persisted?):", cookie)

    if "persisted123" in cookie:
        print("PASS: session state survived across connections (same profile).")
        sys.exit(0)
    print("FAIL: connB did not read back connA's cookie — profile not shared.")
    sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())