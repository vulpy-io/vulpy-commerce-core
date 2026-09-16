# Driving tailnet / operator URLs from inside the Fox container

The WebUI/operator access path is
`https://vulpy-commerce-private.tail873f17.ts.net/` (plus apps on :3000/:9000/
:8080 via the Tailscale sidecar). Inside the Fox container:

- Docker's embedded DNS (127.0.0.11) does NOT resolve MagicDNS names.
- `/etc/hosts` is root-owned and there is NO sudo — Fox cannot add the mapping.
- Navigating the regular CDP/Browserbase browser to the raw tailscale IP
  (`https://100.102.218.42/`) fails with `ERR_SSL_PROTOCOL_ERROR` (SNI mismatch;
  the sidecar serves TLS keyed to the tailnet hostname).

## CLI probes (curl)

`curl --resolve` works because the sidecar serves on the tailscale IP with SNI:

```bash
tailnet=vulpy-commerce-private.tail873f17.ts.net
tsip=100.102.218.42
curl -sk --resolve "$tailnet:443:$tsip" -I "https://$tailnet/"          # WebUI
curl -sk --resolve "$tailnet:3000:$tsip" -I "https://$tailnet:3000/"    # storefront
curl -sk --resolve "$tailnet:8080:$tsip" -I "https://$tailnet:8080/"    # code-server
```

A 302 on the WebUI root = auth redirect (expected). A 502 on :8080 = code-server
down (tailscale serve route exists but upstream loopback isn't listening).

## Full browser verification (login + click-through)

Launch a dedicated headless Chrome with `--host-resolver-rules` mapping the
tailnet name to the tailscale IP, then drive it over raw CDP:

```bash
CHROME=/opt/hermes/chrome-headless-shell        # = AGENT_BROWSER_EXECUTABLE_PATH
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --remote-debugging-port=9333 \
  --user-data-dir=/tmp/chrome-probe-profile \
  '--host-resolver-rules=MAP vulpy-commerce-private.tail873f17.ts.net 100.102.218.42' \
  --ignore-certificate-errors --window-size=1440,1000 about:blank
```

Drive it over raw CDP (Node 24 has a global `WebSocket`; no `ws` package needed):
`Target.createTarget` → `Page.enable` → `Page.navigate` → `Runtime.evaluate` →
`Page.captureScreenshot`. This was used to log into the WebUI with the operator
password and screenshot the post-login UI.

Useful for verifying side-panel iframe targets (Storefront / Medusa Admin /
Payload Admin / Code Editor) in the same browser context the operator would use,
and for checking the code-server editor URL reachability.

## Notes / pitfalls

- Do NOT try to add the hostname to `/etc/hosts` — no sudo, root-owned file.
- The raw-IP navigation error is TLS/SNI, NOT a cert-validation error; adding
  `--ignore-certificate-errors` alone does NOT fix it. The hostname must match
  what the sidecar serves.
- This pattern applies whenever a MagicDNS name is only resolvable on the host /
  tailnet, not in the container: map the name to the tailscale0 IP
  (`100.102.218.42`) with `--host-resolver-rules`.
