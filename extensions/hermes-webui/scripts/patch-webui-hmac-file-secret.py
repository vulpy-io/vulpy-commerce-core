#!/usr/bin/env python3
"""Patch WebUI api/routes.py: add GET /api/file/agent-hmac-secret endpoint.

The agent-cmd server generates a shared HMAC secret at
/data/config/agent-hmac-secret. The env-actions extension needs to read this
secret from the browser to sign operator approvals.

This patch adds a handler that serves the secret file — gated by the same
session-based auth as the existing file-read endpoint — plus lazy-creates
the file if missing (mirroring the agent-cmd server's pattern so both processes
always share a working secret).

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: safe to run repeatedly on an already-patched file.

Usage:
  python3 patch-webui-hmac-file-secret.py /app/hermes-webui/api/routes.py
"""

import sys

IDEMPOTENCY_MARK = "vulpy-hmac-file-secret; /api/file/agent-hmac-secret"


def _count_in_region(src: str, needle: str) -> int:
    """Count occurrences of a needle, returning 0 if idempotency mark is present."""
    if IDEMPOTENCY_MARK in src:
        return 0
    return src.count(needle)


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: python3 {sys.argv[0]} /app/hermes-webui/api/routes.py", file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"already patched — hmac file secret endpoint present ({path})")
        return

    # ── Patch 1: add 'import secrets' if not present ──
    if "import secrets" not in src:
        anchor_import = "import uuid\n"
        n = src.count(anchor_import)
        if n != 1:
            print(f"ERROR: anchor 'import uuid' appears {n} times (expected 1)", file=sys.stderr)
            sys.exit(1)
        src = src.replace(anchor_import, anchor_import + "import secrets\n", 1)

    # ── Patch 2: add the handler and secret-loading func just before _handle_file_read ──
    anchor_handler = "def _handle_file_read(handler, parsed):\n"
    n = src.count(anchor_handler)
    if n != 1:
        print(
            f"ERROR: anchor 'def _handle_file_read' appears {n} times (expected 1)",
            file=sys.stderr,
        )
        sys.exit(1)

    handler_code = (
        "# vulpy-hmac-file-secret; GET /api/file/agent-hmac-secret\n"
        "# The env-actions extension reads the shared agent-cmd HMAC secret\n"
        "# to sign operator approvals. Session-auth gated.\n"
        "HMAC_SECRET_CANDIDATES = (\n"
        '    Path("/data/config/agent-hmac-secret"),\n'
        ")\n"
        "\n"
        "\n"
        "def _load_hmac_secret_for_webui() -> str | None:\n"
        '    """Return the shared HMAC secret, creating it if missing."""\n'
        '    env_secret = os.environ.get("VULPY_AGENT_HMAC_SECRET")\n'
        "    if env_secret:\n"
        "        return env_secret.strip()\n"
        "    for path in HMAC_SECRET_CANDIDATES:\n"
        "        try:\n"
        "            if not path.exists():\n"
        "                path.parent.mkdir(parents=True, exist_ok=True)\n"
        "                path.write_text(secrets.token_hex(32), encoding=\"utf-8\")\n"
        "                os.chmod(path, 0o600)\n"
        "            return path.read_text(encoding=\"utf-8\").strip()\n"
        "        except OSError:\n"
        "            continue\n"
        "    return None\n"
        "\n"
        "\n"
        "def _handle_file_hmac_secret(handler, parsed):\n"
        '    """GET /api/file/agent-hmac-secret — return the shared HMAC secret.\n'
        "\n"
        "    Requires a valid session_id (same auth as _handle_file_read).\n"
        '    """\n'
        '    qs = parse_qs(parsed.query)\n'
        '    sid = qs.get("session_id", [""])[0]\n'
        "    if not sid:\n"
        '        return bad(handler, "session_id is required")\n'
        "    try:\n"
        "        s = get_session_for_file_ops(sid)\n"
        "    except KeyError:\n"
        '        return bad(handler, "Session not found", 404)\n'
        "    secret = _load_hmac_secret_for_webui()\n"
        "    if not secret:\n"
        '        return j(handler, {"error": "no HMAC secret configured"}, status=503)\n'
        '    return j(handler, {"key": secret})\n'
        "\n"
        "\n"
    )

    old_h = anchor_handler
    new_h = handler_code + old_h
    src = src.replace(old_h, new_h, 1)

    # ── Patch 3: add the route dispatch ──
    # Insert right after the /api/file route check.
    anchor_route = '    if parsed.path == "/api/file":\n        return _handle_file_read(handler, parsed)\n'
    n = src.count(anchor_route)
    if n != 1:
        print(f"ERROR: route dispatch anchor appears {n} times (expected 1)", file=sys.stderr)
        sys.exit(1)

    new_route = (
        '    if parsed.path == "/api/file":\n'
        '        return _handle_file_read(handler, parsed)\n'
        '\n'
        '    if parsed.path == "/api/file/agent-hmac-secret":\n'
        '        return _handle_file_hmac_secret(handler, parsed)\n'
    )
    src = src.replace(anchor_route, new_route, 1)

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: added GET /api/file/agent-hmac-secret endpoint -> {path}")


if __name__ == "__main__":
    main()