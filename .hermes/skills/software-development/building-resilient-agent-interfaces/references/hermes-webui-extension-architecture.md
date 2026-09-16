# Hermes browser-extension architecture audit

Use this note when deciding where a third-party Hermes browser feature belongs. Repository ownership and APIs evolve, so re-check the current branches and official docs before implementation. The observations below were verified on 2026-08-01.

## First disambiguate the product

“Hermes WebUI” can refer to two different browser products:

1. **Official Hermes Agent dashboard** — `NousResearch/hermes-agent`, mainly `web/` and `hermes_cli/`. It is a React/TypeScript/Vite application. Dashboard UI plugins use `window.__HERMES_PLUGIN_SDK__` and `window.__HERMES_PLUGINS__`; optional FastAPI routes live in `dashboard/plugin_api.py` and mount below `/api/plugins/<name>/`. Dashboard plugins should consume the host React instance rather than bundle another copy. Canonical doc: `website/docs/user-guide/features/extending-the-dashboard.md`.
2. **Standalone Hermes WebUI** — `nesquena/hermes-webui`. It deliberately ships Python plus vanilla JavaScript with no application bundler or framework. Its public extension gallery is `hermes-webui/hermes-webui-extensions`.

Never infer the target from “WebUI” alone. Identify the launch surface (`hermes dashboard` versus the standalone WebUI server) and intended publication venue first.

## Keep the three extension layers separate

- **Agent Python plugin** (`NousResearch/hermes-agent`): model-callable tools, Agent hooks, commands, and runtime integrations via `register(ctx)`. It does not provide browser rendering. `ctx.inject_message()` is CLI-only, not a general WebUI injection protocol.
- **Official dashboard plugin**: React components through the host SDK plus optional FastAPI plugin routes.
- **Standalone WebUI extension**: trusted same-origin scripts/styles, manifest bundles, extension settings/storage, selected browser hooks, and optional consented loopback sidecars.

Use both UI and Agent plugins only when the feature genuinely needs both a browser surface and Agent-runtime capability. A loopback sidecar is for local/native privileged behavior, not ordinary authenticated WebUI API calls.

## Standalone WebUI trust and packaging rules

Authoritative paths:

- Loader and security contract: `nesquena/hermes-webui/docs/EXTENSIONS.md`
- Host implementation: `nesquena/hermes-webui/api/extensions.py`
- Gallery contract: `hermes-webui/hermes-webui-extensions/docs/extension-entry.md`

Rules:

- Extension JavaScript executes with full authenticated WebUI-origin authority; review it like application code.
- Runtime assets must be local same-origin assets below `/extensions/` or `/static/`; do not use remote script loaders.
- Public entries are self-contained under `extensions/<extension-id>/` with `README.md`, `extension.json`, `manifest.json`, and `assets/`.
- Declare DOM/API/storage/network/filesystem/native behavior, compatibility, lifecycle, cleanup, and manual verification.
- Prefer additive, reversible containers. Do not replace broad core containers or monkey-patch the native chat renderer unless core has exposed and documented a supported seam.
- Use extension-owned settings/storage only for UI preferences and extension data, never as a second canonical transcript store.

## Session and SSE ownership

For the standalone WebUI, browser-facing run/session behavior belongs to WebUI core:

- `POST /api/chat/start` starts browser turns.
- `/api/chat/stream` carries the per-turn stream.
- `api/run_journal.py` owns durable event IDs/replay material.
- `api/routes.py` owns stream routing, replay, snapshot fallback, and session APIs.
- `static/messages.js` interprets events and renders active turns.
- `static/sessions.js` owns native session navigation/loading.
- WebUI JSON sidecars remain relevant authority for substantial WebUI transcript, metadata, pending/recovery, and draft state; do not assume Agent `state.db` is the sole source of truth without verifying current migration status.

Audit both docs and source. In the 2026-08-01 snapshot, `docs/rfcs/session-sse-contract-v1.md` still called `GET /api/sessions/{session_id}/events` “Proposed,” while current `api/routes.py` implemented it. The native client still used a mixture of `/api/chat/stream`, `/api/session/stream`, and `/api/sessions/events`. Treat source/document disagreement as contract immaturity: capability-probe and prefer a core stabilization PR before publishing an extension dependency.

## React or assistant-ui decision

For the official React dashboard, use the host SDK React instance. Do not bundle another React runtime.

For standalone vanilla-JS WebUI, a precompiled React island is technically possible but should not be the default architecture:

- It vendors React plus component/runtime dependencies into trusted extension code.
- The host has no stable general component registry or transcript-renderer takeover contract.
- Replacing chat risks duplicating optimistic turns, run IDs, approvals, tools, cancellation, replay, and recovery state machines.
- The gallery favors small, auditable, additive extensions.

If a React island is mandatory, bound it to one extension-owned container, vendor assets locally, unmount and close listeners/streams on teardown, and keep Hermes as the sole session/transport authority. For assistant-ui, prefer an external-store/custom-runtime adapter over an AI-SDK transport adapter when Hermes already owns message state. Never create a second transcript store or concurrent EventSource for the same run.

## Recommended delivery split

1. Put transport correctness, resumable session SSE, renderer slots, and capability discovery in WebUI core.
2. Put optional operator panels, cards, navigation, and additive UI in the public WebUI extension.
3. Add an Agent plugin only for model-callable tools or Agent-runtime hooks.
4. Add a sidecar only for native/local privileged operations.

## Evidence links

- Agent: https://github.com/NousResearch/hermes-agent
- Official dashboard extensions: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/extending-the-dashboard.md
- Agent plugins: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md
- Standalone WebUI: https://github.com/nesquena/hermes-webui
- Standalone WebUI extension contract: https://github.com/nesquena/hermes-webui/blob/master/docs/EXTENSIONS.md
- Session SSE RFC: https://github.com/nesquena/hermes-webui/blob/master/docs/rfcs/session-sse-contract-v1.md
- Unified-session migration note: https://github.com/nesquena/hermes-webui/blob/master/docs/architecture/unified-session-db.md
- Public gallery: https://github.com/hermes-webui/hermes-webui-extensions
- Gallery entry contract: https://github.com/hermes-webui/hermes-webui-extensions/blob/main/docs/extension-entry.md
- assistant-ui custom runtimes: https://www.assistant-ui.com/docs/runtimes/custom/overview
