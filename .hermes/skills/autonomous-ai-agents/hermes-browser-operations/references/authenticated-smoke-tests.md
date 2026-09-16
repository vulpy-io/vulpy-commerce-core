# Authenticated browser smoke tests

For a Basic-auth-protected Hermes WebUI, setting `Network.setExtraHTTPHeaders` is useful but insufficient: navigation or subresources can still receive a 401 challenge. Use CDP `Fetch.enable({handleAuthRequests: true})` and answer `Fetch.authRequired` with the test credentials. If Fetch interception is enabled, continue every `Fetch.requestPaused` request; otherwise the page hangs.

Verification sequence:

1. Attach to the existing page target, enable Fetch auth handling and Network.
2. Navigate to the public URL and wait for the challenge handler to complete.
3. Check the accessibility tree, not just HTTP health: login form absent, primary navigation present, session list visible, composer enabled, and no visible offline/agent-health banner.
4. Exercise one real flow (for example, click a mission shortcut or send a harmless exact-response probe), then confirm a new assistant response appears.
5. Read browser console warnings/errors and inspect service logs separately. Treat stale rotated log entries as historical; correlate errors with the current process start/restart window.

Keep credentials out of logs and scripts. Read them from the deployment’s configured secret source and never print them.

## Onboarding readiness

A first-run extension should asynchronously query its authenticated readiness endpoint (for this WebUI, `/api/settings`) and skip only the provider-key setup when the response explicitly contains a non-empty default model and provider and does not report any readiness flag as false. Failed, non-OK, malformed, or incomplete responses must retain the manual setup path. The readiness probe must not block native chat or duplicate/inject the welcome surface twice.
