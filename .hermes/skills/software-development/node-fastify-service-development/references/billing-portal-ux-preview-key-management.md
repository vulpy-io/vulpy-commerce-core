# Billing portal UX + preview mode + key management patterns (2026-08-29)

Verified while shipping the operator-approved "key management" pass on the billing portal
(k4 → k5 concept, popup-only key UX, TESTING_ENV preview, USD-only 0.00X usage).

## TESTING_ENV preview mode (portal without login)

The operator wants a URL that opens the inner portal page with NO login/cookie ceremony.
Pattern: a `testingEnv` boolean in Config (`env.TESTING_ENV === "true" || "1"`); when true:

- `currentCustomer()` returns a hardcoded **demo customer** (id 1, `preview@vulpy.test`,
  balance `23.4`, a provisioned `key_value`) instead of reading the session cookie.
- `GET /` renders `renderPortal(...)` for that demo customer instead of the landing page.
- `/api/portal/*` endpoints accept the demo customer (requireCustomer returns it).
- Demo data: when `testingEnv`, the usage endpoint returns **static realistic rows**
  (timestamps, model names, charged_usd 0.00X values, cacheHit) instead of the empty table.

Run the preview: `TESTING_ENV=true PORT=14111 HOST=127.0.0.1 ... node dist/index.js`.
The bridge binds loopback + Tailscale IP automatically; the operator opens
`http://100.102.218.42:14111/` (or the tailnet MagicDNS route) to see the dashboard
directly.

## CRITICAL: don't rely on Tailwind/arbitrary-value classes in server-rendered HTML

The billing portal pages are **server-rendered HTML strings with a STYLE block** — there is
NO Tailwind compiler at runtime. Arbitrary-value utilities like `rounded-[var(--radius-image)]`,
`shadow-[...]`, `bg-[color:var(--x)]`, `bottom-8`, `left-1/2`, `-translate-x-1/2` produce
NOTHING — elements render flat (0 radius, no shadow, absolute positioned at default 0,0).
**Put critical visual properties inline in the `style=` attribute** (radius, shadow, fill,
position) using the CSS vars: `border-radius:var(--radius-image); box-shadow:0 15px 40px
-10px rgba(184,160,137,.45); background:var(--color-download-card-solid);`.
Escape-hatch: if a class IS needed, hand-write the plain CSS rule in the STYLE block
(`.panel { ... box-shadow: ... }`) rather than a Tailwind arbitrary class.

## Elevated cards

Make every `.panel`/card elevated with the same treatment as the login card:
`box-shadow: 0 15px 40px -10px rgba(184,160,137,.45)` (download-card fill + radius-image).

## API key UX — popup-only, no reveal/copy in card (operator-mandated)

- The full plaintext key appears **ONLY in a modal popup** at issue (Get key) and reissue.
  The modal shows the key in `mono`, a copy-icon button with `aria-label`, and the warning
  "This is shown only once — copy it now."
- The **card itself shows only a short masked version** (`vulpy_sk…cdef`). NO "Reveal"
  button, NO copy on the key row anywhere. Reissue and Delete are compact buttons (≈32px);
  Delete keeps the **danger** treatment (red) with a **two-step confirm** (arms → "Delete
  permanently?").
- **Reissue must ALSO be two-step**: click Reissue → confirmation popup ("Your current key
  will stop working immediately." Confirm/Cancel) → on Confirm → POST → then the new-key
  modal.
- Security rationale (operator asked, has a real answer): LiteLLM returns plaintext only at
  creation; the bridge wipes stored plaintext after first reveal; bearer keys are
  undetectably compromised, so rotation (reissue) is the standard mitigation. Min-key-length
  is a **LiteLLM gateway `custom_generate_key_fn` hook** (server-side), not a client option.

## Key rotation/delete backend (already exists — wire, don't re-derive)

- `src/litellm.ts`: `createKey({teamId,maxBudget})` → `{key,keyId}`; `deleteKey({keyId})`
  (POST /key/delete); `updateKeyBudget`.
- `src/billing-db.ts`: `updateCustomerKey`, `revokeKey(id)`, `revealKey(id)` (atomically
  wipes plaintext), `getCustomerForRevoke`.
- `src/routes.ts` already has the admin revoke endpoint; portal endpoints to add:
  `POST /api/portal/key/reissue` (delete old → create new → persist → return plaintext once),
  `POST /api/portal/key/delete` (revoke + clear), `POST /api/portal/key/issue` if needed.
- Rate-limit all (ipRateLimiter/authRateLimiter pattern).

## Usage table: USD-only 0.00X precision, no credits, no spend_usd

- **Credits are GONE as a user-facing concept** (operator-mandated, 2026-08-29). Show
  `balance_usd` / `charged_usd` only. `credits`/`credits_charged` DB columns are legacy.
- **4-decimal USD for per-request figures** (`$0.0012`, not `$0.00`). Add a `roundUsd4()`
  (4dp) helper for usage rows/prices/footer total; keep `roundUsd()` (2dp) for balance
  totals (`$23.40`).
- Columns: **When (UTC)**, **Model**, **Type** (`cache_hit ? "cache read" : "model run"`),
  **Cost (USD)** `charged_usd` 0.00X. Drop `spend_usd` (provider cost = internal). Footer:
  **Total charged (USD)** for visible rows.
- Space under the Recent usage card ≈ 24px (not flush to footer).

## Header username + exit icon + "Back to vulpy.io"

Portal header before the email: username; next to it a compact exit (logout) icon button
(`⏻`, bordered, `aria-label="Sign out"`, onclick `logout()` which POSTs `/api/auth/logout`
then redirects `/`); make the space to the homepage link larger (`margin-left:1.5rem`) and
label it **"Back to vulpy.io"** (not "Homepage").

## Session-cookie signing scheme (exact, for preview/testing)

`@fastify/cookie` signs with **`value.signature`** where signature =
`HMAC-SHA256(secret, value)` → base64 WITHOUT padding (`=` stripped), NOT `value.sig` from a
naive scheme. To inject a valid cookie for preview/testing:
```js
const sig = crypto.createHmac("sha256", secret).update(token).digest("base64").replace(/=+$/, "");
const cookie = `bb_session=${token}.${sig}`;
```
(`token` here = the raw session token from `createSession`.)