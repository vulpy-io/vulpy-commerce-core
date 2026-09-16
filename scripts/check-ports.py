#!/usr/bin/env python3
"""
Port reachability probe — used by generate-agent-status.sh and callable standalone.

Usage:
  python3 scripts/check-ports.py HOST PORT [HOST PORT ...]

Each HOST:PORT pair is probed with a TCP connect (2s timeout).
Exits 0 if ALL are reachable, 1 if any failed.
Prints one JSON object with a "results" array and an "ok" boolean.

Example:
  python3 scripts/check-ports.py host.docker.internal 9000 host.docker.internal 3000
"""

import json
import socket
import sys
import time

TIMEOUT = 2.0


def probe(host: str, port: int) -> dict:
    t0 = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=TIMEOUT):
            latency_ms = round((time.monotonic() - t0) * 1000)
            return {"host": host, "port": port, "ok": True, "latency_ms": latency_ms}
    except OSError as exc:
        return {"host": host, "port": port, "ok": False, "error": str(exc)}


def main() -> None:
    args = sys.argv[1:]
    if len(args) % 2 != 0 or not args:
        print(
            "Usage: check-ports.py HOST PORT [HOST PORT ...]",
            file=sys.stderr,
        )
        sys.exit(2)

    pairs = [(args[i], int(args[i + 1])) for i in range(0, len(args), 2)]
    results = [probe(host, port) for host, port in pairs]
    all_ok = all(r["ok"] for r in results)
    print(json.dumps({"ok": all_ok, "results": results}, indent=2))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
