# Playwright e2e against the turbo-dev stack (Fox container)

Verified 2026-08-19 while running the checkout e2e fixture against the live dev
stack from the Fox container. The repo's Playwright harness (`e2e/checkout/`)
spins its OWN Docker stack — it cannot run from the Fox container (no docker
socket). Two options:

1. Run Playwright directly against the running dev stack (this recipe).
2. Unit tests + served-chunk greps (container-viable, see
   verification-before-completion).

## Prereqs inside the Fox container

- The dev stack runs on the HOST (`pnpm vulpy dev up`); Fox reaches it at
  `host.docker.internal:3000`. The dev server compiles from `/app/workspace`
  (bind mount), NOT from worktrees — the fixture product seed must land in the
  shared checkout's DB (`DATABASE_URL` override when seeding from container:
  `postgresql://medusa:medusa@host.docker.internal:5432/medusa`).
- Dev cold-compile: the first request to a route 404s or takes ~27s while
  Turbopack compiles; the second request is 200. Retry before debugging.

## Blocker 1 — Playwright browser version mismatch

The repo's Playwright wants a specific Chromium build (e.g. 1187); the baked
image has newer builds. `PLAYWRIGHT_BROWSERS_PATH` is pinned to a read-only
image dir, so the auto-install fails. Fix:

```bash
export PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers
npx playwright install chromium        # installs the exact build the repo wants
```

## Blocker 2 — Turbopack HMR rejects foreign Origin (the proxy)

Symptoms: page renders but hydration never completes; console shows the HMR
WebSocket handshake failing; `curl` of the route is fine. Turbopack dev rejects
`_next/webpack-hmr` websocket upgrades whose **Origin doesn't match its
canonical host** (`localhost:3000`). Chromium blocks Host-header overrides on
navigation, so a plain `--host-resolver` trick won't work. Fix: a tiny local
proxy on 127.0.0.1:3300 (the harness's default port) that rewrites BOTH Host
AND Origin to `localhost:3000`, in HTTP/1.1 with Upgrade support:

```js
// proxy.mjs — node proxy that rewrites Host + Origin for Turbopack dev.
// CRITICAL: the WebSocket upgrade path needs its OWN server-level 'upgrade'
// listener that rewrites Host+Origin and splices the raw sockets. A proxy that
// only rewrites headers on the plain HTTP request path (client-side
// proxy.on("upgrade")) leaves the HMR websocket hitting Turbopack with the
// foreign Origin → Next blocks it → the dev client awaits the socket forever →
// React never hydrates (window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers stays 0,
// body stuck behind the preloader spinner). Verified 2026-08-19.
import http from "node:http";

const TARGET = { host: "host.docker.internal", port: 3000 };

const server = http.createServer((req, res) => {
  const headers = { ...req.headers };
  headers.host = "localhost:3000";
  if (headers.origin) headers.origin = "http://localhost:3000";
  const proxy = http.request(
    { host: TARGET.host, port: TARGET.port, path: req.url, method: req.method, headers },
    (pRes) => {
      res.writeHead(pRes.statusCode ?? 502, pRes.headers);
      pRes.on("error", () => res.destroy());
      pRes.pipe(res);
      res.on("error", () => pRes.destroy());
    }
  );
  proxy.on("error", () => { if (!res.headersSent) res.writeHead(502); res.destroy(); });
  req.on("error", () => proxy.destroy());
  req.pipe(proxy);
});

// WebSocket upgrades: rewrite Host+Origin, forward Upgrade headers, splice sockets.
server.on("upgrade", (req, clientSocket, head) => {
  const headers = { ...req.headers };
  headers.host = "localhost:3000";
  if (headers.origin) headers.origin = "http://localhost:3000";
  const proxy = http.request({
    host: TARGET.host, port: TARGET.port, path: req.url, method: "GET", headers,
  });
  proxy.on("upgrade", (pRes, upstreamSocket, upstreamHead) => {
    clientSocket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(pRes.headers).map(([k, v]) => `${k}: ${v}\r\n`).join("") +
      `\r\n`
    );
    if (upstreamHead?.length) upstreamSocket.unshift(upstreamHead);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
    upstreamSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstreamSocket.destroy());
  });
  proxy.on("error", () => clientSocket.destroy());
  proxy.end(head.length ? head : undefined);
});

server.listen(3300, "127.0.0.1");
// Socket-level races (aborted requests) are normal under load; keep serving.
process.on("uncaughtException", (err) => {
  if (err?.code === "ERR_STREAM_CANNOT_PIPE" || err?.code === "ECONNRESET") return;
  console.error(err);
});
```

Diagnosing a hydration stall: if the page SSR-serves fine (`curl` shows product markers),
React loads (`window.next` is an object) but `body.innerText` stays empty and
`__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size` is 0, the HMR websocket is the
suspect — check the dev server log for `Blocked cross-origin request to
/_next/webpack-hmr` and confirm the proxy has a server-level `upgrade` handler.


Then point Playwright at `http://127.0.0.1:3300`. Verify hydration works
through the proxy before running the suite (grep for rendered product markers,
not just status 200).

## Blocker 3 — strict-mode violations from the full dev catalog

The dev DB has the whole demo catalog; CI's e2e seed has a single product.
Strict locators validated against the minimal seed fail against dev:

- PDP related-products carousel renders 7 extra "Add to cart" buttons → 8
  matches. Scope to `<main>` or use `.first()` (PDP button is DOM-first).
- Cart drawer also shows the product line → scope the drawer's locator.
- Checkout login panel adds a second email input ("Email" label after
  2026-08-19 fix) → anchor regex `^email`, not a bare `email` match.
- Cart badge: wait for the badge to show "1" before navigating after
  add-to-cart — the cart cookie can race the navigation, and a title assertion
  matches the PDP itself (false pass).

Hardening rule: make fixtures pass in BOTH environments — scoped locators
(`main`, drawer container), `.first()`, anchored regexes, explicit waits.

## Blocker 4 — Next 16 flight payload false alarms

Next 16 flight payloads ALWAYS serialize the not-found boundary markup in the
route-tree, even on pages that render fine. `grep "Page not found"` on the HTML
is a false alarm on EVERY page. Verify real product markers instead (title,
price, "Add to cart", image alt).

## Order of operations (the 2026-08-19 lesson)

When the operator reports old UI: confirm the fix is SERVED first (served-chunk
grep, see verification-before-completion), THEN invest in harness/proxy work.
Burning turns on the proxy while the operator still sees the old layout is the
exact failure mode that produced "have you actually fixed the issues before
firing tests? I see old layout".
