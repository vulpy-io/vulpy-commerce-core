#!/usr/bin/env python3
"""Patch WebUI gateway_chat.py to inject frontend-tools definitions into runs.

Issue #144 (feat(webui): frontend tools — charts): the operator-pane chart
capability is a FRONTEND tool — the model must know it exists and what
arguments to pass, then the pane renders the chart client-side from the call
arguments (no browser/agent result roundtrip yet).

The runs API (`POST /v1/runs`) accepts a per-run system prompt. The WebUI
already forwards system prefills as `run_body["instructions"]` inside
`_run_gateway_runs_api_streaming` (api/gateway_chat.py). THIS patcher
appends a compact frontend-tools block to that `instructions` field,
rendered from the frontend-tools registry shipped next to the extension
assets (`$HERMES_WEBUI_EXTENSION_DIR/frontend-tools/registry.json`).

Runtime behavior:
  - Registry present  -> block appended (tool name, description, JSON schema,
    and the client-side-render instruction so the model does not duplicate
    the chart in prose). Applies whether or not prefill instructions exist.
  - Registry missing or malformed -> empty block; the chat path behaves
    exactly as today (never crashes the chat path).

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to a FRESH hermes-webui api/gateway_chat.py (same shape as the
    pristine base — verified 2026-08-15).

Usage:
  python3 patch-webui-frontend-tools.py /app/hermes-webui/api/gateway_chat.py
"""

import inspect
import json
import os
import sys

# Idempotency marker — appears inside the injected helper's docstring, so a
# re-run of the patcher (or a double-apply at build time) is a no-op.
MARK = "vulpy-frontend-tools"

# ---------------------------------------------------------------------------
# Anchor: the run-body construction in _run_gateway_runs_api_streaming.
# Verified against the pristine image 2026-08-15: each appears exactly once.
# ---------------------------------------------------------------------------
HELPER_ANCHOR = "def _run_gateway_runs_api_streaming("

RUNBODY_OLD = (
    '    if instructions_parts:\n'
    '        run_body["instructions"] = "\\n\\n".join(part for part in instructions_parts if part)\n'
    '    if conversation_history:\n'
    '        run_body["conversation_history"] = conversation_history\n'
)

RUNBODY_NEW = (
    '    # Vulpy frontend tools (issue #144): append the registry-derived block\n'
    '    # so the model knows the operator pane can render charts client-side\n'
    '    # from its arguments. Applies whether or not prefill instructions\n'
    '    # exist; degrades to no-op when the registry is missing.\n'
    '    _vulpy_ft_block = _vulpy_frontend_tools_block_text()\n'
    '    if instructions_parts:\n'
    '        run_body["instructions"] = "\\n\\n".join(part for part in instructions_parts if part)\n'
    '    if _vulpy_ft_block:\n'
    '        run_body["instructions"] = (\n'
    '            (run_body["instructions"] + "\\n\\n") if run_body.get("instructions") else ""\n'
    '        ) + _vulpy_ft_block\n'
    '    if conversation_history:\n'
    '        run_body["conversation_history"] = conversation_history\n'
)


def _vulpy_frontend_tools_block_text() -> str:
    """Return a compact text block describing registry frontend tools.

    Reads the frontend-tools registry shipped next to the extension assets
    (HERMES_WEBUI_EXTENSION_DIR/frontend-tools/registry.json). Missing or
    malformed registry -> "" so the chat path degrades to today's behavior.
    Marker: vulpy-frontend-tools
    """
    try:
        root = os.environ.get("HERMES_WEBUI_EXTENSION_DIR", "").strip()
        if not root:
            return ""
        registry_path = os.path.join(root, "frontend-tools", "registry.json")
        if not os.path.isfile(registry_path):
            return ""
        with open(registry_path, "r", encoding="utf-8") as _fh:
            payload = json.load(_fh)
        tools = payload.get("tools")
        if not isinstance(tools, list):
            return ""
        lines = [
            "# Frontend tools (rendered client-side in the operator pane)",
            "# The pane renders the result from your tool-call arguments; do not",
            "# describe the chart in prose or echo the data back in your reply.",
        ]
        for tool in tools:
            if not isinstance(tool, dict):
                continue
            name = str(tool.get("name") or "").strip()
            if not name:
                continue
            lines.append(f"## {name}")
            description = str(tool.get("description") or "").strip()
            if description:
                lines.append(description)
            schema = tool.get("schema")
            if isinstance(schema, dict):
                try:
                    lines.append(json.dumps(schema, ensure_ascii=False, sort_keys=True))
                except Exception:
                    pass
            lines.append(
                f"Call {name} with arguments matching the schema above; the "
                "pane renders the result from the arguments."
            )
        return "\n".join(lines)
    except Exception:
        return ""


# The helper is injected verbatim into gateway_chat.py (os/json are already
# imported at the top of that module). Building the injected source from the
# patcher's own function keeps the test copy and the shipped copy identical.
_HELPER_SOURCE = inspect.getsource(_vulpy_frontend_tools_block_text)


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _fail(label: str, anchor: str, count: int, path: str) -> None:
    print(
        f"ERROR: anchor for {label} appears {count} times (expected 1):\n"
        f"  anchor: {anchor[:120]!r}\n"
        f"  File: {path}\n"
        f"  Hermes changed shape — update "
        f"extensions/hermes-webui/scripts/patch-webui-frontend-tools.py",
        file=sys.stderr,
    )
    sys.exit(1)


def apply_patch(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if MARK in src:
        print(f"already patched — frontend-tools injection present ({path})")
        return

    n = _count(src, HELPER_ANCHOR)
    if n != 1:
        _fail("gateway_chat runs-api helper anchor", HELPER_ANCHOR, n, path)

    n = _count(src, RUNBODY_OLD)
    if n != 1:
        _fail("gateway_chat run-body construction", RUNBODY_OLD, n, path)

    # 1. Insert the registry-block helper before _run_gateway_runs_api_streaming.
    src = src.replace(
        HELPER_ANCHOR,
        "\n\n" + _HELPER_SOURCE + "\n" + HELPER_ANCHOR,
        1,
    )
    # 2. Append the block to run_body["instructions"].
    src = src.replace(RUNBODY_OLD, RUNBODY_NEW, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"patched: frontend-tools injection -> {path}")


def main() -> None:
    if len(sys.argv) != 2:
        print(
            f"Usage: python3 {sys.argv[0]} /path/to/api/gateway_chat.py",
            file=sys.stderr,
        )
        sys.exit(1)
    apply_patch(sys.argv[1])


if __name__ == "__main__":
    main()
