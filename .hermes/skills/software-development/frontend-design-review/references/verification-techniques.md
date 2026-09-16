# Verification techniques for frontend design review

Copy-paste recipes proven in a review of a server-rendered inline-CSS portal + email templates (billing bridge).

## 1. Faithful rendering from compiled dist (Node ESM)

Never hand-rebuild HTML from template strings — import the real code.

1. Freshness check: `stat -c '%Y %n' src/portal.ts dist/portal.js` — dist must be newer (or equal), otherwise the render is stale.
2. Generator script in `/tmp` importing the compiled modules:

```js
import { writeFileSync, mkdirSync } from "node:fs";
import { renderLanding, renderPortal } from "<worktree>/.../dist/portal.js";
import { CREDIT_PACKAGES } from "<worktree>/.../dist/packages.js";

mkdirSync("/tmp/review", { recursive: true });
writeFileSync("/tmp/review/landing.html", renderLanding({ packages: CREDIT_PACKAGES }));
writeFileSync("/tmp/review/portal.html", renderPortal({
  customer: { id: "cus_1", email: "dev@example.com", key_value: "sk-...", credits: 1234.56 },
  packages: CREDIT_PACKAGES,
  endpoint: "https://llm.example.com/v1",
}));
```

3. Capturing email HTML without sending: the mailer calls `nodemailer.createTransport(...)` at call time, so monkey-patch the CJS exports object BEFORE calling `createMailer(cfg)`:

```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nm = require("<worktree>/.../node_modules/nodemailer");
const orig = nm.createTransport;
const captured = [];
nm.createTransport = () => ({
  sendMail: async (m) => { captured.push(m); return { messageId: "test" }; },
  close: () => {},
});
const mailer = createMailer(cfg);
await mailer.sendMagicLink("dev@example.com", "https://portal.example/auth?token=abc");
await mailer.sendWelcome("dev@example.com", { apiKey: "sk-...", endpoint: "...", portalUrl: "..." });
nm.createTransport = orig; // restore
// captured[i].html / .text / .subject
```

Note: some environments redact secrets in tool output (an API key literal may come back as `«redacted:…»`). Structure is what matters for review — verify the file on disk, not the echoed string.

## 2. Focus-ring probe (browser console)

```js
const btn = document.querySelector("button");
btn.focus();
const cs = getComputedStyle(btn);
({
  outline: cs.outline,
  matchesFocusVisible: btn.matches(":focus-visible"),
  colorScheme: getComputedStyle(document.documentElement).colorScheme,
})
```

Expected failure mode: dark pages without `color-scheme` render the UA light-scheme ring — measured `rgb(16,16,16) auto 1px` on `#0f1115` background = invisible. Fix: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.

## 3. Mobile simulation when iframes are cross-origin-blocked

- iframe harness: `<iframe src="page.html" width="375" height="820">` at 375 and 320 — renders and screenshots fine, but `contentDocument` is often `null` for `file://` pages (JS can't reach in).
- Measurement fallback on the full page: narrow the container, inject realistic content (long unbreakable strings!), measure:

```js
const wrap = document.querySelector(".wrap");
wrap.style.maxWidth = "335px"; // 375 viewport - 2*20px gutters
const card = [...document.querySelectorAll(".card")].find(c => c.querySelector("table"));
document.getElementById("usage-rows").innerHTML = [
  "<tr><td>2026-08-17 22:14:03</td><td>anthropic/claude-sonnet-4-20250514</td><td>0.0120</td><td>2.40</td><td>yes</td></tr>",
].join("");
const table = card.querySelector("table");
({
  tableScrollW: table.scrollWidth,
  cardClientW: card.clientWidth,
  tableOverflowsCardBy: Math.round(table.getBoundingClientRect().right - card.getBoundingClientRect().right),
})
```

Real finding this catches: table scrollWidth 404px inside a 293px card = 130px overflow past a `border-radius` card with `overflow-x:visible` → horizontal page scroll on phones. The document `scrollWidth` may NOT grow at desktop width, so measure the table rect, not just the document.

## 4. Known computed-style facts (verified in Chrome)

- Unstyled `h2`: UA font-size 1.5em (24px), margins 0.83em (19.92px) — nearly equal to a 26px h1 (weak hierarchy) and creates ~40px top gap inside 20px-padding cards (asymmetric vs 20px bottom). Fix: `h2 { font-size:18px; font-weight:600; margin:0 0 12px; }`.
- Buttons in `display:flex; flex-direction:column` cards stretch to content-box width via `align-items:stretch` — a 157px button inside a 190px card with 16px padding IS full-width; don't report a width bug without measuring.
- Placeholder: `getComputedStyle(input, '::placeholder').color` — UA `#757575` on dark inputs ≈ 4.16:1 (borderline). Fix: `::placeholder { color: var(--muted); }`.
- Buttons without `color-scheme` on dark pages: focus outline measured `rgb(16,16,16)`.

## 5. Contrast reference points (computed, WCAG)

- white on `#4f8cff` = 3.22:1 → FAILS AA normal text (buttons!). `#2f6fe6` = 4.63:1 → passes.
- `#e6e9ef` on `#0f1115` = 15.54:1; `#8b93a3` on `#0f1115` = 6.12:1; `#3fb27f` on `#171a21` = 6.54:1; `#e06c75` on `#171a21` = 5.45:1.
- Hover `filter:brightness(1.1)` lightens an accent and drops button-text contrast further — prefer `brightness(0.92)`.
