# Verify rendered UI, not class strings (operator demand 2026-09-11)

The operator caught Fox claiming "burger verified" from HTML-dump greps. The burger
(MobileMenu overlay) is **client-side only — it does NOT appear in SSR HTML**
(`xl:hidden`, `navigationOpen=false` by default). A grep over the page dump sees
nothing relevant, so "verified" was false. Operator: *"Burger items styling isn't
consistent at all, this is pathetic, I told you to verify."*

## Rules

1. **Client-side-only components can't be verified by SSR grep.**
   If the component renders under a closed overlay/state (burger menu, drawers,
   mega-menu panels, toggled sections), the server HTML has no trace of it.
   - Render the real component to inspect actual output:
     `react-dom/server` `renderToStaticMarkup(<MobileMenu ... navigationOpen={true} />)`
     with mocks for `next/navigation`, `@/redux/store`, `@/config` — copy the stub
     pattern from `Header/MobileMenu.test.tsx`. Dump the HTML to a file and read the
     real per-row classes. (Vitest swallows `console.log`; write the HTML to disk and
     grep the file.)
   - The test files are already the render harness — a throwaway `zz-dump-*.test.tsx`
     reusing their mocks is the fastest true render.

2. **CSS is compiled, not literal.** Tailwind turns `@apply absolute top-1/2 -translate-y-1/2`
   into `top: 50%` + `--tw-translate-y: ...` + `transform`. A literal-class grep
   (`grep "translate-y-1/2"`) returns 0 even when the fix IS live → false "not fixed".
   Grep the COMPILED property (`top: 50%`, `--tw-translate-y`) or the source `@apply` line.

3. **Serve-truth: check the live asset, not the source.** Next dev (Turbopack) serves
   per-compile hashed chunks from `.next/dev/...`. A stale chunk can serve old rules
   even after `touch`. Fetch the page, extract the ACTUAL stylesheet `<link>` href, fetch
   THAT, and grep it. If the hash didn't change after an edit, re-touch source and re-request.

4. **Structural layout bugs need structure, not class presence.** "Container-in-container"
   and heading-scale bugs show up in surrounding SSR structure
   (`<section class="container">` nested in another `.container`) or in computed
   font-size tokens — check the surrounding markup and the token values
   (`.h1` must stay ≥ `.h2`; see `pdp-wishlist-footer-patterns.md` §Heading).

## Diagnostic pattern that works

```
1. curl page → /tmp/page.html
2. If the component should be in SSR and isn't → it's client-side → render it
   (renderToStaticMarkup with state forced open) instead of guessing.
3. For CSS: find the real stylesheet link in /tmp/page.html, curl it, grep the
   COMPILED property (top/--tw-translate-y/clamp value).
4. Confirm the served asset hash actually changed after an edit (touch + re-request).
```

## Seed convergence is part of the feature

Seed changes are not complete when fresh defaults look right. Existing dev data is
usually already populated, so guarded seeds can silently preserve stale navigation,
footer links, legal pages, FAQ/press records, category parents, or editorial blocks.
For every seed change:

- update the code defaults **and** the seed/backfill path;
- make the guard compare the relevant current shape, not merely "document exists";
- explicitly remove deprecated Payload records/blocks when the operator asked for
  removal;
- explicitly reconcile Medusa hierarchy changes, including `parent_category_id: null`
  when moving an existing category to top level (omitted is not the same as null);
- verify with focused seed tests plus a rendered/content-marker probe after reseed;
- never use direct SQL for Payload editorial writes. Use the Payload seed/API path.

Run full relevant suites after content-seed changes. Do not waive stale assertions as
"pre-existing" when the current contract is clear; update fixtures/tests and ship the
suite green.