"""Starter Hermes user plugin — copy to $HERMES_HOME/plugins/<name>/__init__.py.

Then add the registry key to `plugins.enabled` in config.yaml and /reset.
"""


def register(ctx):
    ctx.register_tool(
        name="my_tool",
        toolset="terminal",   # use an EXISTING core toolset — brand-new names
                              # never appear in platform_toolsets lists, so the
                              # tool vanishes on platform surfaces (SKILL.md
                              # "Toolset placement rule")
        schema={
            "name": "my_tool",
            "description": (
                "What the tool does, when to use it, and what it returns. "
                "The LLM reads this to decide when to call it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    # JSON Schema here = zero shell quoting for the caller.
                    "path": {"type": "string", "description": "..."},
                    "limit": {
                        "type": "integer",
                        "description": "...",
                        "default": 20,
                    },
                },
                "required": ["path"],
            },
        },
        handler=_handle,
        check_fn=lambda: True,      # e.g. shutil.which("ssh") is not None
        requires_env=[],            # list env vars the tool needs, if any
    )


def _handle(args, **kwargs):
    import json

    path = args.get("path", "")
    limit = int(args.get("limit") or 20)
    try:
        # ... real work ...
        result = {"success": True, "path": path, "rows": [], "count": min(limit, 0)}
    except Exception as exc:  # surface failures as data, never raise past here
        result = {"success": False, "error": f"{type(exc).__name__}: {exc}"}
    return json.dumps(result)   # handlers MUST return a JSON string
