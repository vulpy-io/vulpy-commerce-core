# Raw CDP verification when MagicDNS won't resolve (2026-09-09)

Symptom: the Hermes browser cannot navigate the operator URL
(`https://<tailnet>.ts.net`) from inside the Fox container —
`net::ERR_NAME_NOT_RESOLVED`. Docker's embedded resolver doesn't know
MagicDNS, and `/etc/hosts` is root-owned (uid 999 has no sudo), so you can't
map the name. The app is usually fine — `curl --resolve <name>:443:<ts-ip>`
returns the real response (200/302), proving SNI-based serving on the
tailscale IP.

Don't fight the OS resolver; launch a dedicated verification browser:

```bash
TS_IP=$(ip -o addr show tailscale0 | awk '{print $4}' | cut -d/ -f1)
/opt/hermes/chrome-headless-shell --headless=new --no-sandbox --disable-gpu \
  --remote-debugging-port=9333 --user-data-dir=/tmp/chrome-probe-profile \
  --host-resolver-rules="MAP vulpy-commerce-private.tail873f17.ts.net $TS_IP" \
  --ignore-certificate-errors --window-size=1440,1000 about:blank
```

`--host-resolver-rules` makes Chrome resolve the MagicDNS name to the sidecar
IP while keeping the correct SNI/Host header. Navigating to the bare IP
instead fails with `net::ERR_SSL_PROTOCOL_ERROR` (SNI-based serving).

Drive it over raw CDP with Node's built-in WebSocket — the `ws` package is
NOT installed in the image and Node ≥22 exposes `global.WebSocket`:

- GET `http://127.0.0.1:9333/json/version` → `webSocketDebuggerUrl`
- Browser ws: `Target.createTarget`; page ws: `Page.navigate`,
  `Runtime.evaluate` (`returnByValue:true`), `Page.captureScreenshot`
  (base64 → write PNG for the operator via MEDIA:)
- Fill inputs via the native value setter, then dispatch input/change:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)`
- `chrome-headless-shell` at `/opt/hermes/chrome-headless-shell` (symlink
  into the playwright cache) — full `chrome` dies with a crashpad error.

Key pitfalls:

- **NEVER autofill the first password field blindly.** The WebUI settings
  "Vulpy Cloud API key (sk-…)" input is `type=password`; submitting the
  gateway password there sends it as a provider key. On 2026-09-09 a probe
  submission poisoned the coder profile's `vulpy` credential (later 401
  "Received=supe****cret, expected to start with 'sk-'"). Inspect the
  input's placeholder / surrounding form BEFORE typing; only fill
  `input[type=password]` when a login gate is confirmed.
- IP-only nav → SSL protocol error (wrong SNI). Use `--host-resolver-rules`.
- Verify the network path with curl `--resolve` first (fast), then the
  browser (rendered truth). curl's `--resolve <name>:<port>:<ip>` also works
  for TLS SNI, so it doubles as a service liveness probe.
- Console/JS errors live in the top frame; iframe navigation failures
  (chrome-error frames) do NOT surface as page JS errors — inspect the
  frame's `contentDocument`/`location` directly.
