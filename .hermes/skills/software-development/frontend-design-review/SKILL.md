---
name: frontend-design-review
description: Load automatically when asked to review/audit the frontend design of web pages — inline CSS/HTML server-rendered pages, dashboards, portals, landing pages, pricing cards, or email HTML. Covers faithful rendering from real code, numeric WCAG contrast verification, focus-state and semantic-HTML checks, mobile simulation, and structured findings (Verdict + High/Medium/Low + What's good) with concrete CSS/HTML fixes.
---

# Frontend Design Review

Review the visual design of web frontends read-only and report structured, concrete findings. Used for designer-profile briefs (e.g. `.hermes/tasks/*-design-*.md` in worktrees) and ad-hoc "review the styles" requests for inline-CSS pages, dashboards, portals, and email templates.

## Workflow

### Exact-reference implementation mode

When the operator supplies an explicit mockup path or URL, treat that artifact as the source of truth: inspect that exact file first, locate the real implementation in the named repository/superrepo, and preserve existing behavior while matching the reference's structure, tokens, copy, states, and interactions. Do not substitute similarly named concepts or unrelated mockups. If the implementation lives outside the active workspace, verify the repository path before dispatching work and report the exact worktree used.

1. **Read the brief first and follow it exactly.** Briefs typically mandate: read-only (no edits, no commits), a report format (`## Verdict: approve | approve-with-changes | needs-work`, `### High/Medium/Low` items as `location — issue — suggested fix (concrete CSS/HTML)`, `### What's good`), and "no 'make it prettier' — every suggestion must be specific". Report absolute paths.

2. **Render faithfully — never hand-rebuild the HTML.** If the code compiles to dist, import the compiled modules and call the render functions with sample data:
   - Freshness check first: `stat -c '%Y %n' src/X.ts dist/X.js` — dist must be newer (or equal).
   - Stub side effects to capture output (e.g. monkey-patch `nodemailer.createTransport` via the CJS exports object before calling `createMailer`, then capture `sendMail` opts — see `references/verification-techniques.md`).
   - Write renders to `/tmp` (keeps the worktree untouched and honors read-only).

3. **Verify numerically — don't trust eyeballs or vision models.** Vision-model claims about colors, sizes, and "blank" panels are frequently wrong; cross-check every claim against source CSS and computed styles.
   - Contrast: run `scripts/contrast.mjs` on every palette pair (text/bg, muted/bg, white-on-accent, placeholder, error/success colors). White-on-accent buttons are the classic AA fail.
   - Focus states: programmatically `.focus()` an element, read `getComputedStyle(el).outline` and `el.matches(':focus-visible')`. Dark pages without `color-scheme` get light-scheme UA rings (often near-black on near-black — invisible).
   - Computed styles via browser console: h1/h2 sizes and margins (unstyled h2 = UA 1.5em + 0.83em margins — the classic hierarchy/spacing bug), grid column count, placeholder color via `getComputedStyle(input, '::placeholder')`.

4. **Mobile check.** The browser viewport is fixed; test 375/320 via an iframe harness (`file://` iframes are JS-inaccessible but render fine — screenshot them). If you need measurements inside iframes and `contentDocument` is null, simulate mobile on the full page instead: narrow the container to the target width and measure `table.scrollWidth` vs card `clientWidth` and `document.documentElement.scrollWidth` vs `clientWidth`. Table min-content overflow (long unbreakable model names/URLs) is the usual breakage — it overflows the card even at desktop widths where the document doesn't scroll.

5. **Email HTML gets its own pass.** Render in a light-theme harness (email clients are light). Check: CTA hierarchy (raw URL as the only CTA is weak — needs a bulletproof table/button), `word-break:break-all` on long URLs and code chips, doctype/html/body + `color-scheme` meta + 600px container + brand header/footer, `text/plain` fallback presence, security copy (expiry, single-use, one-time-key warning).

6. **Report.** Follow the brief's format exactly. Group by severity; each item = `file:line — issue — concrete fix`. End with `### What's good` (cite specifics: measured contrast ratios, semantic HTML, escaping, fallbacks). State the verification method used.

## Revision mode (bounded single-axis edits)
The same territory covers *revising* an existing static design, e.g. "revise for contrast only" / "spacing only" / "typography only". The discipline is to change exactly the named axis and prove it.

1. **Copy the original to a `-v2` file first** (`cp original.html original-v2.html`); never mutate the reviewed artifact in place.
2. **Scope to the `:root` design tokens, not scattered rules.** Update washed-out text tokens at the source (e.g. `--muted`, `--ink-soft`, `--taupe`) — every consumer (labels, table headers, footers, muted paragraphs, currency) darkens at once. Changing only the handful of rules that *use* the bad values leaves identical duplicates untouched.
3. **Add a deeper derivative token for small accents that need more than the general token.** E.g. introduce `--taupe-deep:#6f5335` and point small-stroke rules (crumb links, `![...]` helper labels, currency symbols, package dollar signs, copy buttons) at it, while leaving the base `--taupe` solely for borders. Keeps border color independent from text contrast and avoids over-darkening everything that shares the token.
4. **Verify with `diff original original-v2`.** Confirm the ONLY changes are the intended token values + the few accent rules — layout, headings, SVG logo, views, interactions, and JS must be byte-identical. This is the token-level analog of "verify numerically" in review mode; a bounded-scope claim needs a bounded-scope diff as evidence.
5. Show the user: (a) the exact diff, (b) which washed-out elements the token changes fixed, (c) a clear statement that nothing else changed.

## Production mobile landing/login corrections

For server-rendered auth/portal pages, test the real deployed page at 390px after every responsive change—not only the desktop breakpoint. A desktop two-column hero + form can collapse into a pathological narrow split if the base grid remains `grid-cols-2`; explicitly make the mobile shell single-column/block and restore the two-column grid only inside the desktop media query.

Mobile auth treatment is intentionally opinionated: use a compact image header, keep the form/card full-width and readable, hide hero overlay copy on mobile when the image is busy, and keep explanatory copy on desktop. Never leave desktop overlay text over the mobile crop by accident. When tuning the header/card relationship, adjust the owning container padding and measure header/card rectangles at 390px; do not compensate with arbitrary absolute positioning.

Use the existing card treatment token (`var(--shadow-default)`, radius, surface) rather than inventing one-off shadow values. This is a hard rule: if the user calls out the standard treatment, revert bespoke shadow settings and use the shared token. Image swaps should be converted to the requested WebP asset, added to the server's allowlisted static image map, and verified through the public asset URL before claiming deployment. Keep overlay copy dark/light based on the actual image contrast and use product-relevant messaging, not stale generic copy.

## Pitfalls
- Vision analysis may claim buttons are "full width" or panels are "blank" — verify with measurements. (Buttons in `display:flex; flex-direction:column` cards stretch full width via `align-items:stretch` by default — don't report width bugs without measuring.)
- Don't claim a contrast failure — or a pass — without computing it (white on #4f8cff = 3.22:1 fails AA; #2f6fe6 ≈ 4.63:1 passes).
- iframes in `file://` pages: rendering works, `contentDocument` access often doesn't — screenshot for vision, simulate for measurements.
- Inline-style pages often have zero `@media` rules — the fix is usually a table-overflow wrapper + a 640px breakpoint, not a redesign.
- Sanity-check the code's own claims ("no user-controlled strings interpolated unescaped") — `innerHTML` table builders in the same file often violate them.
- Emails sent as bare fragments (no doctype/html/body) work in most clients but break in dark mode / narrow clients — flag structure, not just styling.

## Support files
- `scripts/contrast.mjs` — WCAG contrast ratio calculator (node; any number of hex pairs; prints ratios + AA pass/fail at 4.5/3.0).
- `references/verification-techniques.md` — copy-paste recipes: dist-import rendering, nodemailer capture stub, focus-ring probe, mobile-simulation console snippets, known computed-style facts.
