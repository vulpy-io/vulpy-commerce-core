#!/usr/bin/env python3
"""Patch WebUI server: per-session WebUI access-mode propagation.

The operator reaches the WebUI over one of three access paths — Tailscale
(private `*.ts.net`), the public edge (`admin.<domain>` or any other public
host), or local loopback (`localhost` / `127.0.0.1` / `::1` / `[::1]`). The
agent's link-reply policy previously guessed: `generate-agent-context.sh`
globally told it to prefer Tailscale whenever the sidecar is up (f9dd6975),
which is wrong when the operator actually views the WebUI over the public
edge or localhost.

This patcher wires the two server surfaces of the per-session fix:

1. api/routes.py — new `POST /api/access-mode` endpoint. The browser client
   POSTs ONLY the normalized `{session_id, mode, origin}` (no paths, no
   HTML, no free text). The handler validates strictly, then persists the
   latest record per session under `<workspace>/.agent/access-mode/
   <session_id>.json` — the same agent-readable `.agent/` area that
   `generate-agent-context.sh` writes `generated-context.md` into, bounded
   to the most recent N sessions.

2. api/streaming.py — `_webui_ephemeral_system_prompt()` appends a COMPACT
   per-session access-mode block so EVERY agent run is told the operator's
   actual access mode, not merely a file the agent may or may not read.
   That function is the single seam feeding all three run paths:
     - legacy in-process (the default `webui_chat_backend`): agent
       ephemeral_system_prompt in streaming.py;
     - gateway completions: prepended system message in gateway_chat.py;
     - gateway runs-API: that system message lands in run_body["instructions"]
       via the prefill system-message handling.
   The block degrades to "" (no injection) when no mode has been reported
   for that session — preserving today's link policy ("offer all labels,
   don't guess").

Rules (patch-webui-frontend-tools.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to a FRESH hermes-webui api/routes.py + api/streaming.py.

Usage:
  python3 patch-webui-access-mode.py /app/hermes-webui/api/routes.py \
      /app/hermes-webui/api/streaming.py
"""

import inspect
import re
import sys

MARK_ROUTES = "vulpy-access-mode; POST /api/access-mode"
MARK_STREAMING = "vulpy-access-mode; per-session access-mode block"

# ---------------------------------------------------------------------------
# Sanitization — also injected into routes.py so the shipped handler and the
# patcher's own copy stay identical.
# ---------------------------------------------------------------------------
_ACCESS_MODES = frozenset({"tailscale", "public", "local"})


def validate_access_mode_fields(body: dict):
    """Return an error string when {mode, origin} is unsafe, else None.

    mode must be exactly one of tailscale|public|local. origin must be a
    bare hostname: no scheme, no path, no traversal, no whitespace, no
    angle brackets, bounded length. Anything else is rejected — the browser
    client never sends paths or HTML, and the server refuses them anyway.
    """
    mode = str(body.get("mode") or "")
    origin = str(body.get("origin") or "").strip()
    if mode not in ("tailscale", "public", "local"):
        return "mode must be one of tailscale|public|local"
    if not origin:
        return "origin is required"
    if len(origin) > 253:
        return "origin too long"
    if origin.startswith(("http:", "https:", "//")) or origin.startswith("."):
        return "origin must be a bare hostname (no scheme)"
    if ".." in origin:
        return "origin must not contain traversal"
    if re.search(r"[/\\]", origin):
        return "origin must not contain a path"
    if re.search(r"\s", origin):
        return "origin must not contain whitespace"
    if "<" in origin or ">" in origin:
        return "origin must not contain HTML"
    return None


# ---------------------------------------------------------------------------
# routes.py — injected handler + atomic bounded write.
# ---------------------------------------------------------------------------
ROUTES_HANDLER_SOURCE = '''
def _vulpy_access_mode_dir(ws_root):
    return Path(ws_root) / ".agent" / "access-mode"


def _vulpy_access_mode_write(ws_root, sid, mode, origin):
    am_dir = _vulpy_access_mode_dir(ws_root)
    am_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "session_id": sid,
        "mode": mode,
        "origin": origin,
        "updated_at": int(time.time()),
    }
    target = am_dir / ("{0}.json".format(sid))
    tmp = am_dir / (".{0}.{1}.tmp".format(sid, uuid.uuid4().hex[:8]))
    try:
        tmp.write_text(json.dumps(record), encoding="utf-8")
        os.replace(str(tmp), str(target))
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
    _vulpy_access_mode_prune(am_dir)


def _vulpy_access_mode_prune(am_dir, max_entries=200):
    try:
        entries = [p for p in am_dir.glob("*.json")]
        if len(entries) <= max_entries:
            return
        entries.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for stale in entries[max_entries:]:
            try:
                stale.unlink()
            except OSError:
                pass
    except OSError:
        pass


def _handle_access_mode_set(handler, body):
    """POST /api/access-mode — record the operator's WebUI access mode.

    Body: {session_id, mode, origin} where mode is exactly one of
    tailscale|public|local and origin is a bare hostname. Persists the
    latest record per session under .agent/access-mode/<session_id>.json
    (agent-readable, bounded). Never accepts paths, HTML, or free text.
    vulpy-access-mode; POST /api/access-mode
    """
    try:
        require(body, "session_id", "mode", "origin")
    except ValueError as e:
        return bad(handler, str(e))
    err = validate_access_mode_fields(body)
    if err:
        return bad(handler, err)
    sid = str(body["session_id"]).strip()
    if not sid or not re.match(r"^[A-Za-z0-9._:-]+$", sid):
        return bad(handler, "Invalid session_id")
    try:
        s = get_session_for_file_ops(sid)
    except KeyError:
        return bad(handler, "Session not found", 404)
    try:
        ws_root = Path(s.workspace)
        mode = str(body["mode"]).strip()
        origin = str(body["origin"]).strip()
        _vulpy_access_mode_write(ws_root, sid, mode, origin)
        return j(handler, {"ok": True, "mode": mode, "origin": origin})
    except (ValueError, FileNotFoundError, PermissionError, OSError) as e:
        return bad(handler, _sanitize_error(e))
'''.lstrip("\n")

# Dispatch insertion: after the last file-op dispatch line, before the
# workspace-management section.
DISPATCH_ANCHOR = (
    '    if parsed.path == "/api/file/open-vscode":\n'
    '        return _handle_file_open_vscode(handler, body)\n'
)
DISPATCH_NEW = (
    '    if parsed.path == "/api/file/open-vscode":\n'
    '        return _handle_file_open_vscode(handler, body)\n'
    "\n"
    '    # vulpy-access-mode; POST /api/access-mode (per-session WebUI access mode)\n'
    '    if parsed.path == "/api/access-mode":\n'
    "        return _handle_access_mode_set(handler, body)\n"
)

# Handler insertion anchor: right before _handle_file_save.
HANDLER_INSERT_ANCHOR = "def _handle_file_save(handler, body):"


# ---------------------------------------------------------------------------
# streaming.py — injected per-session access-mode block helper + injection.
# ---------------------------------------------------------------------------
STREAMING_HELPER_SOURCE = '''
def _vulpy_access_mode_block_text(session_id, workspace):
    """Return a COMPACT per-session access-mode block for the agent run.

    Reads .agent/access-mode/<session_id>.json (written by POST
    /api/access-mode from the browser) under the session workspace and
    renders a short instruction telling the agent which access path the
    operator is actually viewing the WebUI over. Returns "" when no mode
    has been reported for this session (or on any error) — the chat path
    then behaves exactly as today, without guessing.
    Marker: vulpy-access-mode; per-session access-mode block
    """
    try:
        from pathlib import Path as _Path
        import json as _json
        import re as _re

        sid = str(session_id or "").strip()
        ws = str(workspace or "").strip()
        if not sid or not ws or not _re.match(r"^[A-Za-z0-9._:-]+$", sid):
            return ""
        target = _Path(ws) / ".agent" / "access-mode" / ("{0}.json".format(sid))
        if not target.is_file():
            return ""
        with open(str(target), "r", encoding="utf-8") as _fh:
            rec = _json.load(_fh)
        mode = str(rec.get("mode") or "").strip()
        origin = str(rec.get("origin") or "").strip()
        if mode not in {"tailscale", "public", "local"}:
            return ""
        label = {
            "tailscale": "Tailscale (private net)",
            "public": "the public edge",
            "local": "local loopback",
        }[mode]
        lines = [
            "# Operator WebUI access mode (per-session)",
            "# The operator is viewing the WebUI over {0} (origin {1}).".format(label, origin),
            "# Hand operator links that work for THAT access path",
            "# (tailscale->ts.net, public->public host, local->localhost);",
            "# NEVER host.docker.internal or docker-internal hostnames.",
        ]
        return chr(10).join(lines) + chr(10)
    except Exception:
        return ""
'''.lstrip("\n")

STREAMING_HELPER_ANCHOR = "def _webui_ephemeral_system_prompt("

# Anchor: the delivery_prompt block + return join inside
# _webui_ephemeral_system_prompt — insert the access-mode append before the
# return so the block joins into the ephemeral system prompt.
EPHEMERAL_ANCHOR = (
    "    delivery_prompt = _webui_delivery_context_prompt(config_data)\n"
    "    if delivery_prompt:\n"
    "        parts.append(delivery_prompt)\n"
    '    return "\\n\\n".join(part for part in parts if part)\n'
)
EPHEMERAL_NEW = (
    "    delivery_prompt = _webui_delivery_context_prompt(config_data)\n"
    "    if delivery_prompt:\n"
    "        parts.append(delivery_prompt)\n"
    "    # Vulpy per-session access mode: tell EVERY run how the operator is\n"
    "    # viewing the WebUI (tailscale/public/local) so link replies match the\n"
    "    # real access path. Reads .agent/access-mode/<session_id>.json; no-op\n"
    "    # when unreported (offer all labels without guessing).\n"
    "    _vulpy_am_block = _vulpy_access_mode_block_text(\n"
    "        (surface_context or {}).get(\"session_id\"),\n"
    "        (surface_context or {}).get(\"workspace\"),\n"
    "    )\n"
    "    if _vulpy_am_block:\n"
    "        parts.append(_vulpy_am_block)\n"
    '    return "\\n\\n".join(part for part in parts if part)\n'
)


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _fail(label: str, anchor: str, count: int, path: str) -> None:
    print(
        f"ERROR: anchor for {label} appears {count} times (expected 1):\n"
        f"  anchor: {anchor[:120]!r}\n"
        f"  File: {path}\n"
        f"  Hermes changed shape — update extensions/hermes-webui/scripts/"
        f"patch-webui-access-mode.py",
        file=sys.stderr,
    )
    sys.exit(1)


def apply_routes(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if MARK_ROUTES in src:
        print(f"already patched — access-mode routes present ({path})")
        return

    if _count(src, DISPATCH_ANCHOR) != 1:
        _fail("routes dispatch anchor", DISPATCH_ANCHOR, _count(src, DISPATCH_ANCHOR), path)
    if _count(src, HANDLER_INSERT_ANCHOR) != 1:
        _fail(
            "routes handler anchor",
            HANDLER_INSERT_ANCHOR,
            _count(src, HANDLER_INSERT_ANCHOR),
            path,
        )

    # 1. Inject the validation function + handler before the handler block.
    src = src.replace(
        HANDLER_INSERT_ANCHOR,
        inspect.getsource(validate_access_mode_fields) + "\n" + ROUTES_HANDLER_SOURCE + "\n" + HANDLER_INSERT_ANCHOR,
        1,
    )
    # 2. Add the dispatch entry.
    src = src.replace(DISPATCH_ANCHOR, DISPATCH_NEW, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"patched: access-mode endpoint -> {path}")


def apply_streaming(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if MARK_STREAMING in src:
        print(f"already patched — access-mode prompt block present ({path})")
        return

    if _count(src, STREAMING_HELPER_ANCHOR) != 1:
        _fail(
            "streaming helper anchor",
            STREAMING_HELPER_ANCHOR,
            _count(src, STREAMING_HELPER_ANCHOR),
            path,
        )
    if _count(src, EPHEMERAL_ANCHOR) != 1:
        _fail("streaming ephemeral anchor", EPHEMERAL_ANCHOR, _count(src, EPHEMERAL_ANCHOR), path)

    # 1. Inject the helper before _webui_ephemeral_system_prompt.
    src = src.replace(
        STREAMING_HELPER_ANCHOR,
        STREAMING_HELPER_SOURCE + "\n" + STREAMING_HELPER_ANCHOR,
        1,
    )
    # 2. Append the access-mode block into the ephemeral system prompt.
    src = src.replace(EPHEMERAL_ANCHOR, EPHEMERAL_NEW, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"patched: access-mode prompt block -> {path}")


def main() -> None:
    if len(sys.argv) != 3:
        print(
            f"Usage: python3 {sys.argv[0]} /app/hermes-webui/api/routes.py "
            f"/app/hermes-webui/api/streaming.py",
            file=sys.stderr,
        )
        sys.exit(1)
    apply_routes(sys.argv[1])
    apply_streaming(sys.argv[2])


if __name__ == "__main__":
    main()
