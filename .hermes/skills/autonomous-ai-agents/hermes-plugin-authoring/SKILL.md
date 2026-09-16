---
name: hermes-plugin-authoring
description: Extend Hermes/Fox with custom JSON-parameter tools via user plugins ($HERMES_HOME/plugins/<name>/ + register(ctx)). Use when shell-quoting gymnastics or ad-hoc scripting for the same operation keeps recurring and it deserves a first-class tool. Mechanism verified against /app/hermes-agent source 2026-08-24.
---

# Authoring Hermes user plugins (custom tools)

**Why:** tool schemas are pure JSON — arguments never pass through a shell,
which kills the entire quote-mangling class at the source. Registered tools
appear alongside built-ins and are called like any native tool.

## Layout & discovery (verified in `hermes_cli/plugins.py`)

- User plugins: `$HERMES_HOME/plugins/<name>/` — on this install
  `/data/data/hermes/plugins/<name>/` (bind mount; survives rebuilds).
- Sources, lowest→highest precedence: bundled `<repo>/plugins/<name>/` <
  user `~/.hermes/plugins/<name>/` < project `./.hermes/plugins/<name>/`
  (needs `HERMES_ENABLE_PROJECT_PLUGINS`) < pip entry-point group
  `hermes_agent.plugins`. Later sources REPLACE earlier ones on name collision.
- Required per directory plugin: `plugin.yaml` manifest **and**
  `__init__.py` exposing `register(ctx)`.
- Registry key is path-derived (`disk-cleanup`; nested = `image_gen/openai`);
  it is what `plugins.enabled` entries match against. Falls back to `name`.

## plugin.yaml

Fields: `name`, `version`, `description`, `author`, `requires_env`,
`provides_tools`, `provides_hooks`, optional `key`, and `kind`:
`standalone` (default — its own tools/hooks), `backend` (pluggable backend
for a core tool), `exclusive` (single-provider category, e.g. memory),
`platform` (gateway adapter). Unknown kinds silently downgrade to
`standalone`.

**`kind: model-provider` is a separate lane** — consumed by provider
discovery, skipped by the general scanner. Live example:
`/data/data/hermes/plugins/model-providers/vulpy/` (Vulpy gateway profile;
registers a `ProviderProfile` via `from providers import register_provider`,
no `register(ctx)` needed).

**Image generation is a third lane — pluggable *providers*, not JSON tools.**
`image_gen.provider` in config selects a registered `ImageGenProvider`
(registered via `ctx.register_image_gen_provider`, NOT `register_tool`); the
`image_generate` tool dispatches to it. The provider `generate()` contract is
**SYNC** (the tool registers `is_async=False`). Mirror the bundled
`plugins/image_gen/openrouter/` implementation for any OpenRouter-compatible
endpoint, and resolve credentials through
`hermes_cli.runtime_provider.resolve_runtime_provider(requested=...)` so a
model-provider plugin's key/base_url are reused. New providers need a gateway
restart before the live session sees them. Full contract, protocol, model-chain
pattern, offline verification, and the shipped `image-gen-vulpy` example:
`references/image-gen-providers.md`.

## Tool registration

```python
import json

def register(ctx):
    ctx.register_tool(
        name="my_tool",
        toolset="terminal",                # grouping label — see placement rule below
        schema={"name": "my_tool", "description": "...",
                "parameters": {...}},      # JSON Schema — the LLM-facing surface
        handler=lambda args, **kw: json.dumps({"success": True}),  # MUST return str JSON
        check_fn=lambda: True,             # visibility gate (binary present etc.)
        requires_env=["SOME_KEY"],         # tool hidden until env var set
        is_async=False,                    # True for coroutine handlers
    )
```

Verified handler contract (2026-08-24, `tools/registry.py`):
- Handler is called as `handler(args_dict, **kwargs)` and MUST return a JSON
  string. Uncaught exceptions are caught by `registry.dispatch` and returned
  as `{"error": "<sanitized>"}` — but catch your own domain errors anyway to
  control the shape.
- Full `register_tool` kwargs: name, toolset, schema, handler, check_fn,
  requires_env, is_async, description, emoji, override, max_result_size_chars.

For the handler/runtime activation checklist, see `references/plugin-runtime-activation.md`.

**Anti-pattern that breaks EVERY tool in the plugin (2026-08-30, verified on
Vulpy):** declaring a handler as `def fn(args: dict) -> str:` and omitting
`**kwargs`. `registry.dispatch` calls `handler(args, **kwargs)` and injects a
`task_id` keyword on every call, so an `(args)`-only handler dies with
`TypeError: fn() got an unexpected keyword argument 'task_id'`. Because this is
in the dispatch layer, the failure hits every tool at once — one session saw
`coder_dispatch`, `mission_progress`, `store_profile`, `payload_upsert`,
`media_upload`, `category_set_image`, `catalog_seed`, `design_tokens_adopt`,
`design_task` all fail with the identical error, plus every tool in the
`remote-ssh`, `vulpy-content-tools`, `vulpy-store-tools`, `vulpy-factory-tools`,
and `vulpy-design-tools` plugins. Fix each signature to
`def fn(args: dict, **kwargs) -> str:`. Patch BOTH the workspace extension
(`extensions/hermes-plugins/<name>/__init__.py`) AND the active runtime copy
(`$HERMES_HOME/plugins/<name>/__init__.py`, e.g. `/data/data/hermes/plugins/`).
The running gateway process holds the old handler objects from startup, so a
`/reset` or restart is required for the fix to take effect in a live session.

**Regression guard:** add a signature-scan test so an `(args)`-only handler can
never silently return. Pattern (works on the repo without importing anything):
```python
import re
ARGS_ONLY = re.compile(r"^def ([a-zA-Z_]\w*)\(args\)\s*(?:->|:)", re.M)
for init in list(Path("extensions/hermes-plugins").glob("*/__init__.py")):
    bad = [m.group(1) for m in ARGS_ONLY.finditer(init.read_text())]
    assert bad == [], f"{init} args-only handlers: {bad}"
```
Canonical regression test: `extensions/hermes-webui/tests/test_plugin_handler_signatures.py`.
To verify a fix without a live session, load the plugin via
`importlib.util.spec_from_file_location` (for worktree copies) or
`hermes_cli.plugins.PluginManager().discover_and_load()` (for the runtime copy),
then `from tools.registry import registry; registry.dispatch(name, args, task_id="verify")`
and expect a JSON result, not a TypeError.

**Toolset placement rule:** register into an EXISTING core toolset (e.g.
`terminal`) rather than inventing a new one. Platforms pass explicit toolset
lists (WebUI `platform_toolsets.cli` enumerates browser/file/terminal/…), so
a brand-new toolset name never appears there — the tool silently vanishes on
those surfaces while working in raw API tests. A known toolset rides every
bundle that already grants shell access.

**One consolidated plugin per domain (operator correction 2026-08-25).**
Do not split one product's tools across several sibling plugins by concern
(e.g. `vulpy-store-tools`, `vulpy-content-tools`, `vulpy-design-tools`,
`vulpy-factory-tools`). The operator rejected this: "why don't we use one
single vulpy Commerce plugin?" A single plugin — one `<name>/` dir, one
`plugin.yaml`, one `register(ctx)` exposing all tools — is easier to ship, seed
(one entrypoint loop/enable), and maintain. Only split when tools genuinely
serve unrelated products or need independent enable gating. Canonical example:
the consolidated `vulpy-commerce` plugin (9 tools: store_profile,
mission_progress, payload_upsert, media_upload, catalog_seed,
category_set_image, design_tokens_adopt, design_task, coder_dispatch) in one
registration module.

**Auth in content/catalog tools: prefer provisioned API keys, never prompt a
password.** Payload has `useAPIKey` enabled on the Users collection; Medusa
accepts an admin token. The tool should read `PAYLOAD_API_KEY` (env or
`apps/storefront/.env`) and `MEDUSA_API_KEY` (env or root `.env`) and use them
as the auth header, falling back to the seed-creds login only when no key is
provisioned. Never drive an interactive password prompt from inside a tool.

Trust gates — do not fight them:
- `override=True` (replacing a built-in tool) additionally requires
  `plugins.entries.<registry_key>.allow_tool_override: true` in config.yaml.
- Bundled plugins get override for free; user plugins always need the flag.

## Activation

Plugins are opt-in via the `plugins.enabled` allow-list in
`$HERMES_HOME/config.yaml`. Direct config.yaml writes from Hermes file tools
are **blocked by a security guard** ("Refusing to write to Hermes config
file") — the sanctioned route is the CLI: `hermes plugins enable <key>`
(non-interactive; prints an informational note about allow_tool_override but
still enables). An unlisted plugin logs `Skipping '<key>' (not in
plugins.enabled)` and stays invisible. After enabling, tools appear on the
**next session** (`/reset`); toolset changes never apply mid-conversation
(prompt-cache invariant).

## Verification checklist

Offline end-to-end (no new session needed):

```python
from hermes_cli.plugins import PluginManager
pm = PluginManager(); pm.discover_and_load()
for p in pm._plugins.values():
    if p.manifest.key == "my-plugin":
        print(p.enabled, p.error, p.tools_registered)
from tools.registry import registry          # then dispatch like a live session:
print(registry.dispatch("my_tool", {"arg": "value"}))
from model_tools import get_tool_definitions # and confirm schema exposure:
print(any(d["function"]["name"] == "my_tool"
          for d in get_tool_definitions(enabled_toolsets=["terminal"], quiet_mode=True)))
```

1. `PluginManager.discover_and_load()` → enabled True, error None, tool listed.
2. `registry.dispatch(...)` returns sane JSON for happy path AND failure path.
3. `get_tool_definitions(enabled_toolsets=[<chosen>])` includes the tool.
4. Fresh session (`/reset`) → tool visible to the model itself.

**Testing pitfall (cost one false alarm):** exercise the tool by writing the
test payload as a FILE and running it — building args via inline
`python3 -c "…"` re-introduces the very shell-quoting layer the tool exists
to eliminate, and failures look like tool bugs when they're harness bugs.

**Multi-transport auth pitfall:** if the tool shells out over more than one
transport (e.g. `ssh` AND `scp`), the credential/key-fallback loop must be
shared by ALL of them — wiring fallback into one path only produces tools
where `run` works and `put` fails with "Permission denied".

Status: mechanism verified by reading `/app/hermes-agent` source + the live
vulpy model-provider plugin (2026-08-24). **First general-purpose tool plugin
SHIPPED 2026-08-24**: `remote-ssh` (`remote` tool: run/bg/poll/put/get) —
live-tested end-to-end against the EU demo box (quote torture, rc
propagation, bg/poll cycle, md5 roundtrip, root-owned-dir sudo staging).
Ships in-repo at `extensions/hermes-plugins/remote-ssh/` with idempotent
entrypoint seeding; see `fox-remote-ssh-paramiko` skill for usage.

## Templates

Copy and modify — `templates/plugin.yaml` + `templates/tool_plugin_init.py`.

## Enabling on tenant/older installs

If `hermes plugins enable` reports "not installed or bundled" on a box where
you've copied the plugin into the plugins dir (empty `HERMES_HOME`, or a
hand-edited `plugins.enabled` YAML that was mis-indented into a nested list so
the manager loads none), see `references/enabling-plugins-tenant-installs.md`.
Key rules: patch the runtime's REAL config (read HERMES_HOME from the running
process environ), keep `plugins.enabled` as a FLAT 2-space sibling list, and
verify with PluginManager under the runtime HERMES_HOME.
