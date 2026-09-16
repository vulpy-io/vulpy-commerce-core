# Medusa Admin Vite HMR behind Tailscale or public edge

Use when Medusa Admin (`/app`) loads through Fox side-panel, Tailscale MagicDNS, or the public edge but the browser console shows Vite websocket failures.

## Symptom

```text
WebSocket connection to 'wss://<host>:40155/app/?token=...' failed
[vite] failed to connect to websocket (Error: WebSocket closed without opened.)
```

The page may still render. In an iframe it can look like a long Medusa spinner with legitimate network activity, which tempts you toward Caddy/CSP/header fixes. Do not start there.

## Root cause

Medusa Admin is a Vite app in development. In Medusa 2.13 / Vite 6.4, the admin bundler can advertise an internal random HMR websocket port (for example `40155`) to the browser. That port is not reachable from:

- Fox Tailscale URLs (`https://<magicdns>:9000/app`)
- public edge URLs (`https://api.<domain>/app`)
- embedded WebUI side-panel iframes

This is distinct from CSP/X-Frame problems:

- CSP/X-Frame blocks the iframe outright.
- Random `wss://<host>:40xxx/app` failures are the admin app's own Vite HMR client.
- If the same websocket fails in a normal browser tab but the app still works, the HMR path is broken but non-fatal.

## Recommended fix for mixed Tailscale + public edge

Disable Medusa Admin HMR by default and provide an explicit local opt-in.

Reason: one global `clientPort` cannot satisfy both access modes:

- public edge wants browser port `443`
- Fox Tailscale high-port preview wants the API/admin port, usually `9000`
- Vite's random internal port is not externally exposed

Source pattern in `apps/medusa-backend/medusa-config.ts`:

```ts
function shouldDisableAdminHmr(): boolean {
  // Medusa Admin is often viewed through Fox Tailscale or the public edge.
  // In that topology Vite leaks its internal random websocket port to the
  // browser (for example wss://<magicdns>:40155/app), which is not exposed.
  // Disable Admin HMR by default; the admin still runs, just without hot reload.
  return process.env.MEDUSA_ADMIN_HMR !== "1";
}

export default defineConfig({
  admin: {
    vite: () => ({
      server: {
        allowedHosts: getAdminAllowedHosts(),
        hmr: shouldDisableAdminHmr() ? false : undefined,
      },
    }),
  },
});
```

Document the knob in `apps/medusa-backend/.env.template`:

```dotenv
# Medusa Admin Vite HMR is disabled by default for remote dev previews.
# Reason: Medusa's admin bundler advertises a random internal websocket port
# (wss://<host>:40xxx/app), which is unreachable through Fox Tailscale/public edge.
# Set MEDUSA_ADMIN_HMR=1 only for direct local development when you want Admin hot reload.
MEDUSA_ADMIN_HMR=0
```

## Why `hmr: false | undefined` works

With installed Vite 6.4:

- `mergeConfig(base, { server: { hmr: false } })` overwrites the bundler's random-port object with `false`.
- `mergeConfig(base, { server: { hmr: undefined } })` skips the override and preserves the bundler default for local opt-in.
- Vite source confirms `environment.config.server.hmr === false` returns `false` from `createHMROptions`, disabling HMR.

Probe:

```bash
cd /app/workspace/apps/medusa-backend
node --input-type=module - <<'NODE'
import { mergeConfig } from 'vite'
const base = { server: { hmr: { port: 40025, host: 'example.invalid' } } }
const disabled = mergeConfig(base, { server: { hmr: false } })
const optIn = mergeConfig(base, { server: { hmr: undefined } })
console.log(JSON.stringify({ disabledHmr: disabled.server.hmr, optInHmr: optIn.server.hmr }))
if (disabled.server.hmr !== false) process.exit(1)
if (!optIn.server.hmr || optIn.server.hmr.port !== 40025) process.exit(2)
NODE
```

## Verification

1. Typecheck backend config:
   ```bash
   pnpm --filter @apps/medusa-backend typecheck
   ```
2. Sanity-check dotenv template if edited:
   ```bash
   python3 - <<'PY'
   from pathlib import Path
   import re
   p = Path('apps/medusa-backend/.env.template')
   text = p.read_text()
   for n, line in enumerate(text.splitlines(), 1):
       s = line.strip()
       if not s or s.startswith('#'):
           continue
       if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*=.*$', s):
           raise SystemExit(f'invalid dotenv line {n}: {line!r}')
   assert 'MEDUSA_ADMIN_HMR=0' in text
   assert 'MEDUSA_ADMIN_HMR=1' in text
   print('env template OK')
   PY
   ```
3. Restart the dev Medusa process so `medusa-config.ts` reloads.
4. Hard-refresh `/app` through the actual access mode.
5. Browser console must no longer attempt `wss://...:<random-internal-port>/app`.

## Avoid

- Do not treat this as a Caddy header issue unless the iframe is blocked before the app loads.
- Do not hardcode one `clientPort` for installs that support both public edge and Tailscale.
- Do not promise this removes all first-load spinner latency; it removes the broken HMR websocket path. First compile/cache warmup can still take time.

## Config edits alone may NOT disable HMR on the running server (verified 2026-08-15)

The Medusa dev watcher restarts the API child on `medusa-config.ts` changes, and
the config IS re-evaluated (a sentinel `console.log` in `medusa-config.ts`
appears in `.tmp/dev/dev.log` on restart). But the **admin Vite dev server is not
guaranteed to be recreated with the new config** — observed: sentinel confirmed
`hmr: false` was returned and the merge provably yields `hmr: false`, yet the
served `entry.jsx` STILL contained `createHotContext` and the random HMR port was
still listening after watcher restarts.

**What actually clears it: a full dev-stack restart** (not a watcher-triggered
reload):

```bash
# From Fox (agent-cmd bridge — see vulpy-commerce-operator skill):
pnpm vulpy agent cmd dev.restart
```

After that, hard-refresh `/app`. If the browser tab is fine but the WebUI iframe
is slow, the residual slowness is **browser origin partitioning**, NOT Vite
cold-compile and NOT HMR (see next section). Production admin (static build)
loads fast in an iframe.

## Origin partitioning: why the iframe stays slow after HMR is fixed (verified 2026-08-15)

Symptom: Medusa Admin in the WebUI side-panel iframe shows a long spinner every
open, while the same `/app` in a direct browser tab is fast. HMR is already
disabled, yet the iframe is still slow.

Root cause: the WebUI lives at `https://<magicdns>` (port 443/8787) and the
Medusa iframe at `https://<magicdns>:9000` — same hostname, **different port =
different origin**. Browsers partition per-origin (top-level site + frame
origin):

- **HTTP cache is partitioned** — the iframe never reuses the warm cache from
  the direct tab, so the Vite admin re-transforms/re-downloads everything.
- **localStorage is partitioned** — the admin auth token stored by the direct
  tab is invisible to the iframe, forcing re-auth/rebootstrap every load.
- **Changing the Tailscale port does NOT fix this** — `:9100` is still a foreign
  origin to the WebUI; same cold cache + partitioned storage, plus you must
  rewire serve/CSP. Do not propose "move to a different port" as the fix.

The fix that actually works: **same-origin path mounts**. Tailscale serve can
mount app paths on the SAME 443 origin as the WebUI:

```bash
# in the Fox Tailscale sidecar (host side, not from inside Fox):
tailscale serve --bg --https=443 http://127.0.0.1:8787
tailscale serve --bg --set-path /app http://host.docker.internal:9000   # Medusa admin
tailscale serve --bg --set-path /admin http://host.docker.internal:3000 # Payload admin
```

Then the side-panel iframes become `https://<magicdns>/app` and
`https://<magicdns>/admin` — **same origin as the WebUI** → shared cache, shared
localStorage (auth token visible), CSP `'self'` already covers them. Storefront
stays `:3000` (WebUI owns `/`; its Next.js iframe partition is much lighter than
the Vite admin).

Constraints / caveats:

- **Public edge may not exist in a Tailscale-only dev install** — do not design
  iframe URLs around `api.<domain>` for dev; same-origin path mounts work with
  zero public edge.
- The side-panel JS must prefer path URLs only when the mounts actually exist
  (config flag rendered at container start), falling back to port URLs for
  installs that predate the mounts.
- Apply the serve mounts from the HOST (sidecar). Fox has no Docker socket, and
  the tailscale CLI inside the hermes container cannot reach the sidecar's
  tailscaled socket (`failed to connect to local tailscaled`).

## Keep-alive already exists in the side panel

The Vulpy side-panel creates each iframe once on first activation and keeps it
alive across tab switches (frames `Map`; hidden/shown on switch). "Make the
panel keep iframes alive" is already implemented — do not rebuild it. The slow
first-open per session is the partition cold-start above, not iframe teardown.

**Diagnostic sentinels (temporary, remove after):** add `console.log("[SENTINEL]\n...")` inside `shouldDisableAdminHmr()` / `admin.vite()` in `medusa-config.ts`,\nthen grep `.tmp/dev/dev.log` for it after a watcher restart. This proves whether\nthe running process re-evaluated the config at all. Sentinels must be removed\nbefore commit (they pollute the API server log).

**Signal check — presence of `/app/@vite/client` in served HTML is NOT proof HMR
is on.** Vite 6.4 injects the client script tag into the admin HTML in dev
regardless of `server.hmr`; the decisive signal is `createHotContext` in the
transformed module (e.g. `entry.jsx`): `curl -s http://host.docker.internal:9000/app/entry.jsx | grep createHotContext`. If `createHotContext` survives after `hmr: false` + full restart, the served process is NOT the one with the new config (or the admin Vite server was not recreated — see "Config edits alone may NOT disable HMR").

## Pitfall: `.medusa` is a host-only named volume (invisible from Fox)

`apps/medusa-backend/.medusa` is a **host-only named volume** — inside the Fox
container it is a root-owned separate mount that is EMPTY, so:

- `find apps/medusa-backend/.medusa -type f` from Fox returns nothing even when
  the host has compiled content there.
- Running `develop()`/`createServer` probes from Fox with `root: .medusa/client`
  fails with `EACCES mkdir .medusa/client` — the container cannot write it.
- Do not conclude "no compiled artifact exists" from an empty in-container
  listing. If you must inspect host-side `.medusa`, do it via the agent-cmd
  bridge or the operator, not from Fox filesystem tools.
