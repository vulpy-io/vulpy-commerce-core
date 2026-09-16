#!/usr/bin/env python3
"""Patch tool-arg streaming so frontend tools (charts) render during a run.

Problem: while a tool is RUNNING, the assistant-ui pane showed "No data
provided" for frontend tools; only after the run settled (session poll) did
the chart appear.  Root cause is two layers both losing the args:

1. `api_server.py` `_on_tool_start` (runs-progress path) emits the
   `__tool_progress__` payload WITHOUT args — only `tool`/`emoji`/`label`/
   `toolCallId`/`status`.  The WebUI's legacy stream therefore never sees
   chart data until the settled poll.

2. `gateway_chat.py` `_gateway_tool_progress_event` only passes args through
   when `payload["args"]` is already a dict; the gateway serializes
   `function_args` to a JSON string under `args`/`arguments` on other paths,
   so those become `{}` at the WebUI boundary.

Fix:
- api_server: include the raw `function_args` (dict or string) in the
  tool-progress start payload AND in the runs-events `tool.started`
  payload — the runs stream is what the WebUI pane consumes
  (gateway_chat.py subscribes to /v1/runs/{id}/events), and its builder
  previously ignored the args parameter entirely.
- gateway_chat: normalize `args`/`arguments` (dict passthrough, JSON-string
  parse, else `{}`) before building the WebUI `tool` event.

Rules (patch-api-server-runs-heartbeat.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: safe to run repeatedly on an already-patched file.
  - Applies to copies — callers pass the real paths at build/live-apply time.

Usage: python3 patch-stream-tool-args.py /path/to/api_server.py /path/to/gateway_chat.py
"""

import sys

# Idempotency marks — presence of either means that file's patch is applied.
# Kept per-patch so a partially-patched file still receives the remaining one.
API_SERVER_MARK = '"args": function_args if isinstance(function_args, (dict, str)) else {},'
RUNS_CALLBACK_MARK = '"args": args if isinstance(args, (dict, str)) else None,'
GATEWAY_CHAT_MARK = "raw_args = payload.get(\"args\")"

API_SERVER_PATCH = {
    "anchor": (
        '                    "label": label,\n'
        '                    "toolCallId": tool_call_id,\n'
        '                    "status": "running",\n'
    ),
    "old": (
        '                    "label": label,\n'
        '                    "toolCallId": tool_call_id,\n'
        '                    "status": "running",\n'
    ),
    "new": (
        '                    "label": label,\n'
        '                    # [vulpy-stream-tool-args] carry raw args (dict or\n'
        '                    # JSON string) so streaming frontend tools (charts)\n'
        '                    # render before tool_complete arrives.\n'
        '                    "args": function_args if isinstance(function_args, (dict, str)) else {},\n'
        '                    "toolCallId": tool_call_id,\n'
        '                    "status": "running",\n'
    ),
    "description": "tool-progress start payload now carries raw function_args",
}

GATEWAY_CHAT_PATCH = {
    "anchor": (
        '    event_payload = {\n'
        '        "event_type": "tool.completed" if is_complete else "tool.started",\n'
        '        "name": name,\n'
        '        "preview": payload.get("label") or payload.get("preview"),\n'
        '        "args": payload.get("args") if isinstance(payload.get("args"), dict) else {},\n'
        '        "is_error": bool(payload.get("error")) or status in {"error", "failed"},\n'
        '    }\n'
    ),
    "old": (
        '    event_payload = {\n'
        '        "event_type": "tool.completed" if is_complete else "tool.started",\n'
        '        "name": name,\n'
        '        "preview": payload.get("label") or payload.get("preview"),\n'
        '        "args": payload.get("args") if isinstance(payload.get("args"), dict) else {},\n'
        '        "is_error": bool(payload.get("error")) or status in {"error", "failed"},\n'
        '    }\n'
    ),
    "new": (
        '    raw_args = payload.get("args")\n'
        '    if raw_args is None:\n'
        '        raw_args = payload.get("arguments")\n'
        '    if isinstance(raw_args, str) and raw_args.strip():\n'
        '        try:\n'
        '            raw_args = json.loads(raw_args)\n'
        '        except Exception:\n'
        '            raw_args = {}\n'
        '    if not isinstance(raw_args, dict):\n'
        '        raw_args = {}\n'
        '    event_payload = {\n'
        '        "event_type": "tool.completed" if is_complete else "tool.started",\n'
        '        "name": name,\n'
        '        "preview": payload.get("label") or payload.get("preview"),\n'
        '        "args": raw_args,\n'
        '        "is_error": bool(payload.get("error")) or status in {"error", "failed"},\n'
        '    }\n'
    ),
    "description": "tool args normalized (args/arguments, dict or JSON string) at the WebUI boundary",
}


RUNS_CALLBACK_PATCH = {
    "anchor": (
        '            if event_type == "tool.started":\n'
        '                _push({\n'
        '                    "event": "tool.started",\n'
        '                    "run_id": run_id,\n'
        '                    "timestamp": ts,\n'
        '                    "tool": tool_name,\n'
        '                    "preview": preview,\n'
        '                })\n'
    ),
    "old": (
        '            if event_type == "tool.started":\n'
        '                _push({\n'
        '                    "event": "tool.started",\n'
        '                    "run_id": run_id,\n'
        '                    "timestamp": ts,\n'
        '                    "tool": tool_name,\n'
        '                    "preview": preview,\n'
        '                })\n'
    ),
    "new": (
        '            if event_type == "tool.started":\n'
        '                _push({\n'
        '                    "event": "tool.started",\n'
        '                    "run_id": run_id,\n'
        '                    "timestamp": ts,\n'
        '                    "tool": tool_name,\n'
        '                    "preview": preview,\n'
        '                    # [vulpy-stream-tool-args] the pane consumes this\n'
        '                    # runs-events stream — carry raw args (dict or\n'
        '                    # string) so frontend tools render while running.\n'
        '                    "args": args if isinstance(args, (dict, str)) else None,\n'
        '                })\n'
    ),
    "description": "runs-events tool.started payload now carries raw args",
}


def _apply_one(path: str, patch: dict, marks: list[str], label: str) -> None:
    with open(path) as f:
        src = f.read()
    if any(mark in src for mark in marks):
        print(f"already patched — {label} ({patch['description']})")
        return
    count = src.count(patch["anchor"])
    if count != 1:
        raise SystemExit(
            f"patch-stream-tool-args: anchor for {label} appears {count} times "
            f"(expected 1) in {path} — refusing to patch"
        )
    if patch["old"] not in src:
        raise SystemExit(f"patch-stream-tool-args: old text not found for {label} in {path}")
    with open(path, "w") as f:
        f.write(src.replace(patch["old"], patch["new"], 1))
    print(f"patched {label}: {patch['description']}")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch-stream-tool-args.py <api_server.py> <gateway_chat.py>")
    _apply_one(sys.argv[1], API_SERVER_PATCH, [API_SERVER_MARK], "api_server.py (tool-progress)")
    _apply_one(sys.argv[1], RUNS_CALLBACK_PATCH, [RUNS_CALLBACK_MARK], "api_server.py (runs callback)")
    _apply_one(sys.argv[2], GATEWAY_CHAT_PATCH, [GATEWAY_CHAT_MARK], "gateway_chat.py")


if __name__ == "__main__":
    main()
