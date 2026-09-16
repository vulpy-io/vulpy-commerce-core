# Vulpy Commerce — Hermes WebUI extension bundle

Repo-owned WebUI extensions shipped in the Hermes container image
(`/app/fox-overlay/webui_static` at runtime).

## Layout

- `manifest.json` — the WebUI extension manifest (single source of injection).
- `branding/` — canonical fox favicon/PWA assets plus the branded Web App
  Manifest copied into the baked upstream WebUI by `patch-ui.js.py`.
- `message-renderer.js` — public hermes-webui message-renderer extension
  (vendored). **Keep its name and its own manifest entry — never rename it and
  never fold it into `vulpy-commerce`.**
- `features/` — Vulpy Commerce UI features, one directory per feature:
  - `vulpy-commerce-core/` — **core bootstrap**: `window.VulpyCommerce`
    registry + runtime config loader + tiny event bus (`index.js`) and shared
    `[data-vc]` design tokens (`index.css`). Loaded first in the manifest.
  - `vulpy-commerce-profile-switcher/` — existing CSS-only feature (unchanged).
  - `vulpy-commerce-side-panel/` — side panel: floating toggle + right drawer
    with lazy tabbed iframes from the runtime config, plus `pages/` custom
    pages (same-origin, served by `/extensions/`).
- `patch-ui.js.py` — build-time `ui.js` patch tool (never served or synced).

## Rules

- **One extension entry for all Vulpy Commerce features** (id `vulpy-commerce`).
  Do NOT create a new manifest entry per feature — add assets to the single
  entry's `scripts` / `stylesheets` arrays. Per-feature toggles are a
  deliberate non-goal: the product layer is one switch.
- `message-renderer` keeps its public identity: file name, manifest entry,
  description. Do not prefix or rename it.
- Namespace everything `vulpy-commerce.*` / `vc-*` / `data-vc-*` — the
  extension root is shared with other Vulpy products; unnamespaced names
  collide. Features register on the registry, never on `window` directly.

## How it ships

- **Image build:** `Dockerfile.hermes` COPYs `manifest.json`, `message-renderer.js`
  and `features/` into the extension root and enables manifest injection via
  `HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json`. The same build runs
  `patch-ui.js.py` against `/app/hermes-webui` to brand every browser-title
  path and replace the complete upstream favicon/PWA set.
- **Container start:** `scripts/hermes-fox-entrypoint.sh` (Item 8) re-syncs the
  bundle from the checkout into the extension root — prunes stale files under
  `features/`, installs everything world-readable (`install -m 644`). Edit a
  file → restart the container → applied. No rebuild needed for content edits.
- **Config render (Item 8b):** the same entrypoint step renders
  `vulpy-commerce.config.json` into the overlay root from `VULPY_WEBUI_IFRAMES`
  (JSON array of `{id,label,url}` iframe targets; default `[]`). The side panel
  reads it via the core config loader.
- **First activation:** images built before this wiring exists need one rebuild
  (`docker compose -f docker-compose.hermes.yml build`) so the manifest env is
  present; the running server reads the manifest per request afterwards.

## Core bootstrap + registry

`features/vulpy-commerce-core/index.js` defines the single `window.VulpyCommerce`
registry. Loaded FIRST in the `vulpy-commerce` manifest `scripts` array
(deferred scripts execute in order), so every later feature script can rely on
it existing.

```js
VulpyCommerce.register({ id: "my-feature", name: "…", mount?, pages? });
VulpyCommerce.getFeature(id);           // one feature
VulpyCommerce.getFeatures();            // all features (pages aggregation)
VulpyCommerce.getConfig();              // { iframes: [{id,label,url}] }
VulpyCommerce.loadConfig();             // idempotent; resolves with config
VulpyCommerce.on("config:loaded", fn);  // subscribe
VulpyCommerce.emit("event", data);      // publish
```

- Core auto-loads the config on `DOMContentLoaded` and emits `config:loaded`
  (always — even when the config file is missing, so features can render their
  empty states).
- `index.css` provides shared `--vc-*` tokens scoped to `[data-vc]` roots
  (accent, backgrounds, borders, spacing scale, z-index). No global resets.

## Runtime config (iframe targets)

Rendered at container start by the entrypoint into
`/extensions/vulpy-commerce.config.json`:

```json
{
  "iframes": [
    { "id": "storefront", "label": "Storefront", "url": "http://localhost:3000" },
    { "id": "admin", "label": "Medusa Admin", "url": "http://localhost:9000/app" }
  ]
}
```

Source: `VULPY_WEBUI_IFRAMES` in `environments/hermes/.env` (JSON string; see
`.env.example`). Unset or invalid → `[]` and the panel shows a
"No tabs configured" hint.

**CSP requirement:** the WebUI CSP base is `frame-src 'self'`. Every external
iframe target origin must ALSO be allowlisted in `HERMES_WEBUI_CSP_FRAME_EXTRA`
(space-separated origins, wildcard subdomain + port allowed) or the frame
stays blank. Custom pages served from `/extensions/...` are same-origin and
need nothing. Pages that fetch external APIs additionally need
`HERMES_WEBUI_CSP_CONNECT_EXTRA`.

## Custom pages

Any `pages/*.html` under a feature dir is served at
`/extensions/features/vulpy-commerce-<feature>/pages/<file>.html`
(same-origin → allowed by `frame-src 'self'`, no CSP change).
Conventions:

- Standalone pages load the core tokens and bootstrap:
  `<link rel="stylesheet" href="/extensions/features/vulpy-commerce-core/index.css">`
  and `<script src="/extensions/features/vulpy-commerce-core/index.js" defer></script>`
  (`../index.js` only when the page wants the feature's own behavior).
- Register a page with the side panel by adding it to the feature's `pages`
  array in the registry entry — it shows up in the "Vulpy pages" tab group.
- No external fetches in v1 pages; if a page later needs them, the operator
  adds origins to `HERMES_WEBUI_CSP_CONNECT_EXTRA`.

## Empty state suggestion provider (message-renderer hook)

The assistant-ui pane shows the fox avatar + prompt tiles whenever a session
has no messages (mirroring the native empty chat screen). The tile list is
pluggable so Vulpy Commerce can supply or rotate suggestions per session:

```js
// From any Vulpy feature script (load order does not matter — the pane
// re-reads the hook every time the empty state mounts):
window.HermesMessageRenderer?.registerHermesSuggestionsProvider?.(() => [
  { text: "What's in this workspace?", icon: "<svg …>" },
  { text: "What's on my schedule today?" },
]);
// Pass null to clear and fall back to the default tiles.
```

Contract (`src/message-renderer-island.tsx`):

- `HermesSuggestion` = `{ text: string, icon?: string }` — `icon` is inline
  SVG markup or emoji, rendered before the text (trusted same-origin code
  only — it is injected as HTML).
- `HermesSuggestionsProvider` returns `HermesSuggestion[] | null | undefined`
  or a Promise of the same. `null`/`undefined` → default tiles.
- The provider is re-queried each time the empty state mounts (keyed by
  session id), so rotation on session/new-chat switch works by just returning
  the current list.
- Tile clicks fill the host composer (`#msg`) and call the host `send()`,
  exactly like the native empty-state tiles.
- The user "hide new-chat suggestions" pref (`hide_empty_state_suggestions`)
  hides the tile grid in the pane too.

The default tiles mirror the native copy (workspace / schedule / plan).

Example: `features/vulpy-commerce-side-panel/pages/shop-overview.html` —
same-origin status page fetching `/api/extensions/status` and linking the
configured iframe targets.

## Adding a UI feature

1. `mkdir features/vulpy-commerce-<feature>`
2. Add `index.css` / `index.js` / assets there (`index.js` registers on
   `VulpyCommerce`; DOM work happens after `config:loaded` or on
   `DOMContentLoaded` — never on `window`).
3. Reference them in the `vulpy-commerce` manifest entry
   (`scripts` / `stylesheets` arrays) — core stays FIRST.
4. Restart the container (or rebuild if the manifest mechanism isn't live yet).

## Verification

- `python3 -c "import json; json.load(open('manifest.json'))"` — manifest valid
- `python3 branding.test.py -v` — title patch idempotence, current-upstream
  anchors, manifest values, canonical SVG hash, icon dimensions, and ICO sizes
- `node --check features/vulpy-commerce-<feature>/index.js` — JS syntax
- `bash -n scripts/hermes-fox-entrypoint.sh` after touching the sync/config render
- Regenerate `scripts/.vulpy-security-checksums` when the entrypoint changes:
  `python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums`
  then `python3 scripts/generate-checksums.py --verify`
- `curl -sI <webui>/extensions/features/vulpy-commerce-<feature>/index.css`
- `curl -s <webui>/extensions/vulpy-commerce.config.json` after a restart
