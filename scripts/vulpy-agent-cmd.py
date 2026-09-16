#!/usr/bin/env python3
"""
vulpy-agent-cmd.py — Fox-side agent command client.

Sends a command to the host agent-cmd-server via the shared agent-cmds/
directories and waits for the response.

Directory layout (matches server)
-----------------------------------
  agent-cmds/req/   — Fox-owned; this client writes + deletes req files
  agent-cmds/resp/  — daemon-owned; client reads + requests deletion via cleanup

Usage (inside Fox container):
  python3 /app/workspace/scripts/vulpy-agent-cmd.py <cmd>

Examples:
  python3 /app/workspace/scripts/vulpy-agent-cmd.py dev.up
  python3 /app/workspace/scripts/vulpy-agent-cmd.py dev.status
  python3 /app/workspace/scripts/vulpy-agent-cmd.py status
  python3 /app/workspace/scripts/vulpy-agent-cmd.py ts.status

Available commands: dev.up / dev.down / dev.restart / dev.wake / dev.sleep /
                    dev.status / dev.logs / dev.logs-medusa / dev.logs-storefront /
                    ts.status / hermes.rebuild / runtime.repair-pnpm /
                    store.reseed / status

Exit codes: 0 = success, 1 = command error / timeout / unknown command.
"""

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths — must match the server
# ---------------------------------------------------------------------------

ROOT_DIR  = Path(__file__).resolve().parent.parent
REQ_DIR   = ROOT_DIR / "agent-cmds" / "req"
RESP_DIR  = ROOT_DIR / "agent-cmds" / "resp"

RESPONSE_TIMEOUT = 310.0   # seconds — slightly longer than daemon's 300s command timeout
POLL_INTERVAL    = 0.5


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Send a command to the host agent-cmd-server."
    )
    parser.add_argument(
        "cmd",
        help=(
            "Command: dev.up / dev.down / dev.restart / dev.wake / dev.sleep / "
            "dev.status / dev.logs / dev.logs-medusa / dev.logs-storefront / "
            "ts.status / hermes.rebuild / runtime.repair-pnpm / store.reseed / "
            "status"
        ),
    )
    parser.add_argument(
        "--timeout", type=float, default=RESPONSE_TIMEOUT,
        help=f"Seconds to wait for response (default {RESPONSE_TIMEOUT})",
    )
    args = parser.parse_args()

    cmd = args.cmd

    # Ensure Fox-owned req/ dir exists (created by hermes-compose.sh +
    # chowned to Fox by entrypoint, but be safe when running manually).
    REQ_DIR.mkdir(parents=True, exist_ok=True)

    req_id   = str(uuid.uuid4())
    req_path = REQ_DIR  / f"{req_id}.req.json"
    resp_path = RESP_DIR / f"{req_id}.resp.json"

    payload = json.dumps({"id": req_id, "cmd": cmd})

    # Atomic write so the server never sees a partial file.
    tmp = req_path.with_suffix(".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.rename(req_path)

    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        if resp_path.exists():
            try:
                text = resp_path.read_text(encoding="utf-8")
                resp = json.loads(text)
            except Exception as exc:
                print(f"[agent-cmd] ERROR reading response: {exc}", file=sys.stderr)
                _cleanup(req_path, resp_path)
                return 1

            _cleanup(req_path, resp_path)

            if resp.get("out"):
                print(resp["out"], end="")
            if resp.get("err"):
                print(resp["err"], end="", file=sys.stderr)

            return 0 if resp.get("ok") else 1

        time.sleep(POLL_INTERVAL)

    # Timed out — remove the req file so the daemon skips it.
    _cleanup(req_path, resp_path)
    print(
        f"[agent-cmd] Timeout: no response for '{cmd}' after {args.timeout:.0f}s.\n"
        f"Is the agent command server running on the host?\n"
        f"  pnpm vulpy hermes up",
        file=sys.stderr,
    )
    return 1


def _cleanup(*paths: Path) -> None:
    for p in paths:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
