# Hermes WebUI Extension System

Captured 2026-08-04 from live `/app/hermes-webui/api/extensions.py` (image: `ghcr.io/fox-in-the-box-ai/cloud:stable`).

## Environment variables

| Var | Purpose |
|-----|---------|
| `HERMES_WEBUI_EXTENSION_DIR` | Root directory the extension system serves and writes. Must be an existing directory. When unset, defaults to `STATE_DIR/extensions` (created on first gallery install). |
| `HERMES_WEBUI_EXTENSION_MANIFEST` | Path to a `manifest.json` **relative to `EXTENSION_DIR`** (absolute paths starting with `/` or `~` are rejected). Declares extensions that appear in the panel with Enable/Disable toggle. |
| `HERMES_WEBUI_EXTENSION_SCRIPT_URLS` | Comma-separated absolute same-origin script URLs to always-inject (bypasses panel, no toggle). Use for non-optional host overlays only. |
| `HERMES_WEBUI_EXTENSION_STYLESHEET_URLS` | Same as above, for CSS. |

**Vulpy/Fox defaults (baked into `ghcr.io/fox-in-the-box-ai/cloud:stable`):**
```
HERMES_WEBUI_EXTENSION_DIR=/app/fox-overlay/webui_static
HERMES_WEBUI_EXTENSION_STYLESHEET_URLS=/extensions/fox-in-the-box.css
HERMES_WEBUI_EXTENSION_SCRIPT_URLS=/extensions/onboarding-preview.js,/extensions/fox-overlay.js,/extensions/hostname-prompt.js,/extensions/fallback-polish.js,/extensions/stream-error-retry.js,/extensions/chat-model-preselect.js,/extensions/model-picker-filter.js,/extensions/approval-explain.js
```
These are non-toggleable host overlays. The `fox-overlay/webui_static/` dir is writable in the overlay layer (survives restart, lost on `docker pull`).

**CRITICAL — these vars come from the baked image, not from `environments/hermes/.env`.**
The `docker-compose.hermes.yml` does NOT have an `env_file:` stanza, so variables written
to `environments/hermes/.env` are NOT passed into the running container. To set a new
`HERMES_WEBUI_*` variable, it must be declared in `Dockerfile.hermes` with `ENV` (durable)
or passed via `docker compose run --env` (one-off). Never set `HERMES_WEBUI_*` in
`environments/hermes/.env` and expect it to work — it won't.

## Manifest format

```json
{
  "extensions": [
    {
      "id": "vulpy.message-renderer",
      "name": "Vulpy Message Renderer",
      "description": "Short description shown in the Extensions panel.",
      "enabled": true,
      "scripts": ["message-renderer.js"]
    }
  ]
}
```

**Script URL resolution rules** (from `_manifest_asset_url`):
- Absolute same-origin path (`/static/…`, `/extensions/…`) → used as-is.
- Relative path (`message-renderer.js`) → resolved under `/extensions/<asset_base>/` (i.e. relative to the manifest file's directory within `EXTENSION_DIR`).
- External URL with scheme → allowed but flagged for CSP review.

If the JS is also copied into `EXTENSION_DIR`, use a relative path — the manifest and JS
sit in the same directory so `message-renderer.js` resolves cleanly. If the JS already
lives at `/app/hermes-webui/static/`, use `/static/message-renderer.js` (absolute).

## Canonical Vulpy wiring (durable — baked into image)

This is the **correct, permanent approach** for any Vulpy-specific extension.

### Repo layout

```
extensions/
  hermes-webui/
    manifest.json          ← declares the extension(s)
    message-renderer.js    ← the bundle (copy from hermes-webui/static/ or built artifact)
```

### `extensions/hermes-webui/manifest.json`

```json
{
  "extensions": [
    {
      "id": "vulpy.message-renderer",
      "name": "Vulpy Message Renderer",
      "description": "Replaces the default message transcript with Vulpy-branded rendering. Enable/disable any time from this panel.",
      "enabled": true,
      "scripts": ["message-renderer.js"]
    }
  ]
}
```

### `Dockerfile.hermes` additions (at the end, before `USER hermes`)

```dockerfile
# ---------------------------------------------------------------------------
# Vulpy WebUI extensions — baked into the fox-overlay so they survive restarts
# and appear as manageable extensions in Settings → Extensions.
# ---------------------------------------------------------------------------
COPY extensions/hermes-webui/manifest.json       /app/fox-overlay/webui_static/manifest.json
COPY extensions/hermes-webui/message-renderer.js /app/fox-overlay/webui_static/message-renderer.js
ENV HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json
```

`manifest.json` is relative to `HERMES_WEBUI_EXTENSION_DIR` (`/app/fox-overlay/webui_static`),
so `manifest.json` (no leading slash) is the correct value.

### After adding a new extension

1. Add the extension JS to `extensions/hermes-webui/<name>.js`.
2. Add an entry to `extensions/hermes-webui/manifest.json`.
3. `pnpm vulpy hermes up` (rebuilds `vulpy-hermes:local` and restarts the container).
4. Go to **Settings → Extensions → Installed** to verify it appears with toggle.

## Temporary wiring (survives restart, lost on `docker pull`)

Use only for in-session testing before committing to `Dockerfile.hermes`.

```bash
# 1. Write manifest directly into the writable overlay layer
cat > /app/fox-overlay/webui_static/manifest.json <<'EOF'
{
  "extensions": [
    {
      "id": "vulpy.message-renderer",
      "name": "Vulpy Message Renderer",
      "enabled": true,
      "scripts": ["/static/message-renderer.js"]
    }
  ]
}
EOF

# 2. Set env var at runtime (must be in Dockerfile or via docker compose --env flag)
# NOTE: setting it in environments/hermes/.env does NOT work (no env_file: stanza).
# For a quick one-off test, inject inline:
# docker compose -f docker-compose.hermes.yml run --env HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json hermes
```

## Things that do NOT work

- Setting `HERMES_WEBUI_EXTENSION_MANIFEST` in `environments/hermes/.env` — the compose
  file has no `env_file:` stanza; the var never reaches the container.
- Using an absolute path like `/app/fox-overlay/webui_static/manifest.json` as the env
  var value — the server rejects paths starting with `/` or `~`.
- Hardwiring `<script src="static/message-renderer.js"></script>` in `index.html` — the
  user gets no panel toggle, the script always loads, and the extension panel's Disable
  does nothing.
- A `localStorage` guard in `canActivate()` — creates an invisible second toggle the
  panel cannot see or clear; gets wiped on browser data clear.

## Enable/Disable lifecycle

1. Extension appears in **Settings → Extensions → Installed** tab immediately after restart.
2. User clicks "Disable" → server records the disabled state in `HERMES_WEBUI_STATE_DIR/extension_state.json`.
3. On next page load, server does not inject the script. `canActivate()` in the script is never called.
4. User clicks "Enable" → state cleared → script injected again on next load.

**Implication for `canActivate()`:** it should only check `hostCaps.capabilities` (whether
the host seam exists). It must NOT implement user-toggling — that belongs to the panel.

## Extension panel tabs

- **Gallery** — installable extensions from the configured gallery URL.
- **Installed** — all manifest-declared + gallery-installed extensions; Enable/Disable toggles here.
- **Diagnostics** — CSP, load errors, extension root status.

## manifest.json location vs EXTENSION_DIR

The manifest is resolved relative to `EXTENSION_DIR`. If `EXTENSION_DIR=/app/fox-overlay/webui_static`
and `EXTENSION_MANIFEST=manifest.json`, the server reads `/app/fox-overlay/webui_static/manifest.json`.

The `extensions/` sub-path prefix (`EXTENSION_ROUTE_PREFIX`) is used for relative-path asset
resolution only — assets declared as `/static/…` bypass it entirely. Assets declared as
`message-renderer.js` (bare name, manifest in root of EXTENSION_DIR) resolve to
`/extensions/message-renderer.js`.
