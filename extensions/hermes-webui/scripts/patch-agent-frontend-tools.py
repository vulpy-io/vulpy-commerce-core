#!/usr/bin/env python3
"""Patch hermes-agent to register frontend-tool stubs.

Issue #144 (feat(webui): frontend tools — charts): the operator chat path runs
through the gateway runs API (``POST /v1/runs`` -> api_server platform), so
the model's ``create_chart`` call must resolve to a REAL registered tool in the
agent image. The pane renders the chart from the tool-call arguments; the
agent-side handler is a benign stub (validate shape, return a rendered
acknowledgment, never echo caller data / PII, never block).

What this patcher ships (verified against the pristine image 2026-08-15):

  1. tools/frontend_tools.py  — the stub tool module. It calls
     ``registry.register(...)`` at module top level, so
     ``discover_builtin_tools()`` (tools/registry.py) auto-imports it — no
     toolset-resolution internals need touching. Registered into the
     ``frontend`` toolset.

  2. toolsets.py — two edits that expose the ``frontend`` toolset on the
     api_server platform (verified by an in-image resolve probe):
       a. a static ``frontend`` toolset entry (``["create_chart", "render_preview"]``);
       b. ``"frontend"`` added to the ``hermes-api-server`` composite's
          ``includes``.
     With both, ``_get_platform_tools({}, "api_server")`` recovers
     ``frontend`` into the platform's enabled toolsets and the tool resolves
     in the agent's final tool list. No other platform includes ``frontend``,
     so the tool does not leak into CLI/Telegram/cron/etc.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once,
    or when tools/frontend_tools.py already exists WITHOUT our marker (an
    operator-modified file must never be silently clobbered).
  - Idempotent: re-run prints "already patched"/"already present", exit 0.
  - Applies to FRESH hermes-agent files (same shape as the pristine base).

Usage:
  python3 patch-agent-frontend-tools.py \
      /app/hermes-agent/toolsets.py /app/hermes-agent/tools
"""

import sys

# Idempotency marker — present in BOTH the written module and the toolsets.py
# comment, so each file's re-run check is independent.
MARK = "vulpy-frontend-tools"

# ---------------------------------------------------------------------------
# tools/frontend_tools.py — the stub tool module.
# ---------------------------------------------------------------------------
FRONTEND_TOOLS_MODULE = '''"""Frontend tools: agent-side stubs for tools the WebUI pane renders client-side.

Issue #144 (feat(webui): frontend tools — charts): the operator pane renders
charts from the LLM's tool-call arguments (no browser->agent result folding
yet). The agent-side tool exists so the model's call RESOLVES to a real
registered tool on the api_server platform. The pane never reads the result —
it renders from the call arguments — so the handler returns only a benign
acknowledgment and never echoes caller data back into the transcript.

Marker: vulpy-frontend-tools

Exposure on the operator chat path (POST /v1/runs, api_server platform):
  - registered into the 'frontend' toolset (discover_builtin_tools()
    auto-imports this module because it calls registry.register at top level);
  - toolsets.py defines a static 'frontend' toolset (["create_chart", "render_preview"]) and
    includes it in the 'hermes-api-server' composite, so
    _get_platform_tools({}, "api_server") recovers 'frontend' into the
    platform's enabled toolsets and the tool resolves in the agent.
"""

import json

from tools.registry import registry, tool_error

VALID_CHART_TYPES = ("line", "bar", "pie", "area")
VALID_PREVIEW_TYPES = ("html", "svg", "image", "audio", "video")
MAX_PREVIEW_TITLE_LENGTH = 120


def create_chart_tool(chart_type, title, data):
    """Validate a chart request and return a benign rendered acknowledgment.

    The pane renders the chart from the tool-call arguments; the result is a
    stub so the call resolves. Never echo caller data (labels/values/titles)
    back — only shape-level error messages, which cannot carry PII.
    """
    chart_type = str(chart_type or "").strip().lower()
    if chart_type not in VALID_CHART_TYPES:
        return tool_error(
            "chart_type must be one of " + ", ".join(VALID_CHART_TYPES)
            + f" (got {chart_type!r})."
        )
    if not isinstance(data, list) or not data:
        return tool_error("data must be a non-empty array of {label, value} points.")
    for index, point in enumerate(data):
        if not isinstance(point, dict) or "label" not in point or "value" not in point:
            return tool_error(
                f"data[{index}] must be an object with 'label' and 'value'."
            )
    if not isinstance(title, str) or not title.strip():
        return tool_error("title is required.")
    return json.dumps({"status": "rendered", "tool": "create_chart"}, ensure_ascii=False)


CREATE_CHART_SCHEMA = {
    "name": "create_chart",
    "description": (
        "Render a data chart in the operator pane. Call this when the operator "
        "asks for a chart, graph, plot, or data visualization. The pane renders "
        "the chart client-side from your arguments; do not also describe the "
        "chart in prose."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "chart_type": {
                "type": "string",
                "enum": ["line", "bar", "pie", "area"],
                "description": "The chart type to render.",
            },
            "title": {"type": "string", "description": "Chart title."},
            "data": {
                "type": "array",
                "description": "Data points to plot (label + numeric value each).",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "value": {"type": "number"},
                    },
                    "required": ["label", "value"],
                },
            },
            "options": {
                "type": "object",
                "description": "Optional chart options.",
                "properties": {
                    "color": {"type": "string"},
                    "x_label": {"type": "string"},
                    "y_label": {"type": "string"},
                },
            },
        },
        "required": ["chart_type", "title", "data"],
    },
}

RENDER_PREVIEW_SCHEMA = {
    "name": "render_preview",
    "description": (
        "Preview a file already written to disk in the operator pane. Call with "
        "an absolute local path and one of html, svg, image, audio, or video. "
        "Do not pass file contents: the pane fetches the path safely."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["html", "svg", "image", "audio", "video"]},
            "path": {"type": "string", "description": "Absolute local path to the preview file."},
            "title": {"type": "string", "maxLength": 120, "description": "Optional preview title."},
        },
        "required": ["type", "path"],
    },
}


def _create_chart_handler(args, **_kwargs):
    return create_chart_tool(
        chart_type=args.get("chart_type"),
        title=args.get("title"),
        data=args.get("data"),
    )


def render_preview_tool(preview_type, path, title=None):
    """Validate a local-file preview request without reading or echoing it."""
    if preview_type not in VALID_PREVIEW_TYPES:
        return tool_error("type must be one of " + ", ".join(VALID_PREVIEW_TYPES) + ".")
    if not isinstance(path, str) or not path or not path.startswith("/") or "\\x00" in path:
        return tool_error("path must be a non-empty absolute local path.")
    if title is not None and (not isinstance(title, str) or len(title) > MAX_PREVIEW_TITLE_LENGTH):
        return tool_error("title must be a string no longer than 120 characters.")
    return json.dumps({"status": "rendered", "tool": "render_preview"}, ensure_ascii=False)


def _render_preview_handler(args, **_kwargs):
    args = args if isinstance(args, dict) else {}
    return render_preview_tool(args.get("type"), args.get("path"), args.get("title"))


registry.register(
    name="create_chart",
    toolset="frontend",
    schema=CREATE_CHART_SCHEMA,
    handler=_create_chart_handler,
    emoji="📊",
)

registry.register(
    name="render_preview",
    toolset="frontend",
    schema=RENDER_PREVIEW_SCHEMA,
    handler=_render_preview_handler,
    emoji="🖼️",
)
'''

# ---------------------------------------------------------------------------
# toolsets.py — static frontend toolset + hermes-api-server include.
# Anchors verified against the pristine image 2026-08-15 (each appears once).
# ---------------------------------------------------------------------------
TOOLSET_INSERT_OLD = '    "hermes-api-server": {\n'
TOOLSET_INSERT_NEW = (
    '    # vulpy-frontend-tools (issue #144): static toolset whose tools the\n'
    '    # operator pane renders client-side. Recovered for the api_server\n'
    '    # platform via the hermes-api-server include below.\n'
    '    "frontend": {\n'
    '        "description": "Frontend tools rendered client-side in the operator pane (create_chart et al.)",\n'
    '        "tools": ["create_chart", "render_preview"],\n'
    '        "includes": []\n'
    '    },\n'
    '\n'
    '    "hermes-api-server": {\n'
)

INCLUDES_OLD = (
    '            "ha_list_entities", "ha_get_state", "ha_list_services", "ha_call_service",\n'
    '\n'
    '        ],\n'
    '        "includes": []\n'
    '    },\n'
    '    \n'
    '    "hermes-cli": {\n'
)
INCLUDES_NEW = (
    '            "ha_list_entities", "ha_get_state", "ha_list_services", "ha_call_service",\n'
    '\n'
    '        ],\n'
    '        "includes": ["frontend"]\n'
    '    },\n'
    '    \n'
    '    "hermes-cli": {\n'
)


CLI_INCLUDES_OLD = (
    '"hermes-cli": {\n'
    '        "description": "Full interactive CLI toolset - all default tools plus cronjob management",\n'
    '        "tools": _HERMES_CORE_TOOLS,\n'
    '        "includes": []\n'
    '    },\n'
)
CLI_INCLUDES_NEW = (
    '    "hermes-cli": {\n'
    '        "description": "Full interactive CLI toolset - all default tools plus cronjob management",\n'
    '        "tools": _HERMES_CORE_TOOLS,\n'
    '        # vulpy-frontend-tools (issue #144): WebUI operator chat (legacy-direct)\n'
    '        # resolves the cli platform toolset - frontend exposes create_chart,\n'
    '        # rendered client-side in the operator pane.\n'
    '        "includes": ["frontend"]\n'
    '    },\n'
)

def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _fail(label: str, anchor: str, count: int, path: str) -> None:
    print(
        f"ERROR: anchor for {label} appears {count} times (expected 1):\n"
        f"  anchor: {anchor[:120]!r}\n"
        f"  File: {path}\n"
        f"  Hermes changed shape — update "
        f"extensions/hermes-webui/scripts/patch-agent-frontend-tools.py",
        file=sys.stderr,
    )
    sys.exit(1)


def _apply_toolsets(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if MARK in src:
        legacy_toolset = TOOLSET_INSERT_NEW.replace(
            '["create_chart", "render_preview"]', '["create_chart"]'
        )
        if TOOLSET_INSERT_NEW in src:
            print(f"already patched — frontend toolset present ({path})")
            return
        n = _count(src, legacy_toolset)
        if n != 1:
            _fail("marker-owned toolsets.py frontend toolset", legacy_toolset, n, path)
        with open(path, "w", encoding="utf-8") as f:
            f.write(src.replace(legacy_toolset, TOOLSET_INSERT_NEW, 1))
        print(f"upgraded: frontend toolset adds render_preview -> {path}")
        return

    n = _count(src, TOOLSET_INSERT_OLD)
    if n != 1:
        _fail("toolsets.py hermes-api-server insertion point", TOOLSET_INSERT_OLD, n, path)

    n = _count(src, INCLUDES_OLD)
    if n != 1:
        _fail("toolsets.py hermes-api-server includes block", INCLUDES_OLD, n, path)

    src = src.replace(TOOLSET_INSERT_OLD, TOOLSET_INSERT_NEW, 1)
    src = src.replace(INCLUDES_OLD, INCLUDES_NEW, 1)
    n = _count(src, CLI_INCLUDES_OLD)
    if n != 1:
        _fail("toolsets.py hermes-cli composite", CLI_INCLUDES_OLD, n, path)
    src = src.replace(CLI_INCLUDES_OLD, CLI_INCLUDES_NEW, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"patched: frontend toolset + hermes-api-server include -> {path}")


def _write_module(tools_dir: str) -> None:
    target = f"{tools_dir.rstrip('/')}/frontend_tools.py"
    try:
        with open(target, encoding="utf-8") as f:
            existing = f.read()
    except FileNotFoundError:
        existing = None

    if existing is not None:
        if MARK in existing:
            if existing == FRONTEND_TOOLS_MODULE:
                print(f"already present — frontend_tools.py stub exists ({target})")
                return
            with open(target, "w", encoding="utf-8") as f:
                f.write(FRONTEND_TOOLS_MODULE)
            print(f"upgraded: frontend_tools.py stub adds render_preview -> {target}")
            return
        print(
            f"ERROR: {target} exists WITHOUT the {MARK!r} marker — refusing to "
            "overwrite a divergent/operator-modified file. Reconcile it first.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(target, "w", encoding="utf-8") as f:
        f.write(FRONTEND_TOOLS_MODULE)
    print(f"wrote: frontend_tools.py stub -> {target}")


def main() -> None:
    if len(sys.argv) != 3:
        print(
            f"Usage: python3 {sys.argv[0]} /path/to/toolsets.py /path/to/tools",
            file=sys.stderr,
        )
        sys.exit(1)
    _apply_toolsets(sys.argv[1])
    _write_module(sys.argv[2])


if __name__ == "__main__":
    main()
