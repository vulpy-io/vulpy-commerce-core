# Medusa Admin SPA origin + iframe slowness (verified 2026-08-15)

Session-tested diagnosis for "Medusa Admin is slow / spins forever in the WebUI
iframe but loads fine in a normal browser tab".

## Root cause: baked `__BACKEND_URL__` forces cross-origin API calls

`medusa-config.ts` `admin.backendUrl` is baked into the admin SPA at Vite
build/dev time as the `__BACKEND_URL__` define (dashboard code:
`MEDUSA_BACKEND_URL = __BACKEND_URL__ ?? "/"`).

If `VITE_MEDUSA_BACKEND_URL` or `MEDUSA_BACKEND_URL` points at the public edge
(`https://api.<domain>`), then the SPA **always calls that origin**, regardless
of which origin served the page. Consequences:

- WebUI iframe at `https://<magicdns>.ts.net:9000/app` → API calls go
  **cross-origin** to `api.<domain>` → CORS preflights, partitioned
  localStorage (auth token mismatch), pending `feature-flags` / `users/me`.
- In a normal browser tab opened at the **public URL** the calls are
  same-origin → fast. That asymmetry (tab OK, iframe slow) is the fingerprint.
- If the public domain doesn't exist in dev (Tailscale-only setup) it just pends.

### Fix (applied 2026-08-15)

`apps/medusa-backend/medusa-config.ts`:

```ts
backendUrl: process.env.VITE_MEDUSA_BACKEND_URL || "/",
```

- `"/"` (or `""`) → the JS SDK's `getBaseUrl()` maps it to
  `window.location.origin` (`@medusajs/js-sdk/dist/client.js`:
  `if (passedBaseUrl === "" || passedBaseUrl === "/") return window.location.origin`).
  Same-origin in every access mode: Tailscale `ts.net:9000`, public edge
  `api.<domain>`, loopback `localhost:9000`.
- **Use `"/"`, not `""`** (verified 2026-08-15): the dashboard code is
  `MEDUSA_BACKEND_URL = __BACKEND_URL__ ?? "/"`, and Vite's `define` replaces
  `__BACKEND_URL__` with a **string literal** — an empty string is NOT nullish,
  so `??` does not fire and `""` flows straight into the SDK. It happens to
  work only because js-sdk's `getBaseUrl` special-cases `""`; `"/"` is the
  explicit, robust value and matches the SDK's own intended fallback.
- Do NOT fall back to `MEDUSA_BACKEND_URL` for the SPA — that var is the
  server-side URL (emails/links) and baking it in is exactly the bug.
- Only set `VITE_MEDUSA_BACKEND_URL` explicitly when the admin SPA is hosted
  separately from the API (e.g. CDN). Installer writes it
  (`scripts/vulpy-install.sh`, `scripts/lib/install-helpers.sh`) — leaving the
  runtime `apps/medusa-backend/.env` value blank is the dev-correct state.
- `.env.template` documents this; keep the runtime `.env` blank in dev.

### Verify the runtime value (not the source)

The dashboard exposes the SDK on `window.__sdk`:

```js
// in the browser console after the admin boots
window.__sdk.client.config.baseUrl   // must be the page's own origin
```

Also watch network for same-origin `/admin/feature-flags`, `/admin/users/me`.
Vite `define` only applies at transform time — grepping raw `node_modules/.vite/deps`
chunks for `__BACKEND_URL__` shows the placeholder, which is a red herring; the
runtime probe is authoritative.

## Pitfall: changing `.env` requires a FULL dev restart, not a watcher reload

`medusa develop` parent loads `.env` at startup. Watcher reloads re-fork the
child, but the child **inherits the parent's already-loaded env** and dotenv
never overwrites existing vars — so editing `apps/medusa-backend/.env` and
waiting for the watcher to restart is NOT enough. The stale value persists.

Fix: full stack restart via the agent bridge:
`pnpm vulpy agent cmd dev.restart` (works from inside Fox; direct
`pnpm vulpy dev restart` is uid-gated). Then confirm the new boot in
`.tmp/dev/dev.log` before probing the browser.

**Do NOT rely on `touch medusa-config.ts` to pick up `.env` changes**
(verified 2026-08-15): touching the config triggers a watcher reload that
RE-reads `medusa-config.ts` (a load-time sentinel in the file confirms it),
but the child still inherits the parent's already-loaded env, so the stale
env var survives. A config sentinel in the dev log can therefore make a
reload look effective when the env value did NOT change. Only a full
restart re-reads `.env`; use the runtime probe (`window.__sdk...baseUrl`)
as the source of truth, not the presence of a reload in the log.

## Admin HMR disable (random-port websocket leak)

Medusa Admin dev (Vite) leaks a random internal HMR port to the browser
(`wss://<magicdns>:40155/app` failing; port changes every restart:
40155 → 40025 → 24678). Disable HMR by default:

```ts
function shouldDisableAdminHmr(): boolean {
  return process.env.MEDUSA_ADMIN_HMR !== "1";  // opt-in via MEDUSA_ADMIN_HMR=1
}
// in admin block:
vite: () => ({ server: { allowedHosts: getAdminAllowedHosts(),
                        hmr: shouldDisableAdminHmr() ? false : undefined } }),
```

Verified: `admin.vite()` return value reaches the bundler; Vite `mergeConfig`
with `server.hmr: false` provably yields `false`; with `hmr:false`, Vite does
NOT inject `createHotContext` into transformed modules (checked against
installed Vite 6.4.1). HTML still includes the `/@vite/client` script tag even
with HMR off — that alone is not proof HMR is on; check for `createHotContext`.

### CORS / iframe constraint (design decision, do not relitigate)

Medusa does not work well under a sub-path. Serving the admin as a same-origin
path mount (`tailscale serve --set-path /app http://host.docker.internal:9000`)
was considered and REJECTED by the operator: the apps run on their own ports by
design. Keep iframes on distinct ports; fix origin problems via the SPA backend
URL, not path mounts. Browser origin partitioning (cold cache + partitioned
localStorage per top-site×frame-origin) is why a cross-origin iframe is slow
even when the direct tab is warm — same-origin backend URL removes the API-call
penalty; cache partition on first load remains a dev-only Vite transform cost.
