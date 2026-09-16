# Universal design-system and Store Designer migration audit

Use this reference when inventorying or planning a storefront-wide token/Tailwind/Payload Store Designer migration. It records the detailed 2026-08-01 read-only inspection and the durable architecture decisions that came from it.

## Current storefront baseline

- Storefront: `apps/storefront`, Next.js 16 / React 19 / Payload 3.
- Styling: Tailwind 3.4 with `tailwind.config.ts`, PostCSS `tailwindcss` + `autoprefixer`, and `tailwind-scrollbar` 3.
- Global stylesheet: `src/app/css/style.css`, currently imported by `components/Layout/SiteLayoutClient.tsx` rather than the site route-group layout.
- Live font: Inter through `next/font/google`. Local RF Dewi CSS and four font files exist but appear unreferenced.
- `async-gallery.css` also appears unreferenced.
- Payload globals: `site-settings`, `navigation`, and `footer`. `Homepage` is exported from `src/globals/index.ts` but not registered in `payload.config.ts`.
- Payload live preview exists for Pages, Product Content, and Category Content, but only the block renderer participates in live updates. Globals have no draft/live-preview path.
- No Store Designer global, design request collection, custom admin components, CSP, `frame-ancestors`, X-Frame-Options, Playwright, Storybook, or visual regression suite exists.
- The current Fox/host command server is deliberately dev-lifecycle-only. It is not Payload-to-Fox task ingress.

## Styling census

A read-only regex census over 546 TS/TSX/CSS files found approximately:

- 91 hexadecimal color occurrences in 34 files
- 1,533 arbitrary Tailwind-style values in 138 files
- 46 inline-style expressions in 25 files
- 530 inline SVG fill/stroke attributes in 50 files
- 926 legacy theme-color utility occurrences in 110 files
- 1,623 spacing utility occurrences in 127 files

Treat these as scoping figures, not AST-precise lint results. Broad grep searches can be empty, truncated, or fail on unmatched regex delimiters; retry with narrow literals or a read-only Python walker before making absence claims.

Representative high-risk files:

- `src/components/Header/index.tsx`
- `src/components/Layout/SiteLayoutClient.tsx`
- `src/components/Common/ProductItem.tsx`
- `src/components/Home/PromoBanner/index.tsx`
- `src/components/cms/BlocksRenderer.tsx`
- `src/components/ShopWithSidebar/**`
- `src/components/ShopDetails/ProductDetails.tsx`
- `src/components/Checkout/CheckoutSteps.tsx`

The current palette's `blue` token is `#860044` (burgundy), so migration must split intent rather than blindly rename classes. Persisted CMS CTA choices `blue | teal | dark` also need a schema/data migration to universal roles such as `primary | accent | inverse`.

Public SVG colors require classification:

1. UI icons: migrate to `currentColor` and semantic foreground tokens.
2. Official payment/brand marks: preserve mandated fills and allowlist them.
3. Decorative media: treat as media, not component tokens.

## Canonical ownership decision

Use partitioned, app-owned, tool-neutral DTCG files as the only canonical value source:

- Canonical: `apps/storefront/design/tokens/{reference,semantic,component}.tokens.json` plus `design/themes/store.tokens.json`.
- Generated: `src/app/css/tokens.generated.css`, Tailwind aliases, TypeScript types, `apps/storefront/DESIGN.md`, and `.impeccable/design.json`.
- Payload: draft/session/proposal state only; the production storefront must not fetch its accepted design values from Payload.
- Impeccable: agent/design-quality and feedback tooling only; it is not the token authority.
- Fox: converts explicitly approved proposals to path-allowlisted, base-hash-guarded source diffs, regenerates artifacts, and runs checks.

Every Payload draft/request must record a base hash of canonical tokens. Reject stale application if source has changed.

## Universal taxonomy

Use three layers:

1. Primitive/reference: brand and neutral ramps, status ramps, font families/weights, spacing, radii, borders, shadows, motion, breakpoints, layers.
2. Semantic: background, foreground, border, action, status, commerce price/stock, typography roles, focus, and layout roles.
3. Component aliases: button, input, product card, header, modal, badge, table, carousel, checkout panel, and similar recipes.

Application code should mostly consume semantic/component names, never template color names.

Safe operator MVP:

- primary brand color
- optional accent color
- curated font preset
- radius profile
- density profile
- preview route/device

Keep exact ramps, neutral/status colors, typography metrics, breakpoints, grids, spacing scales, shadows, motion, z-index, focus behavior, checkout/Stripe internals, raw CSS, arbitrary font URLs, and low-level component overrides agent-only.

## Generator implementation invariants

The first tokenized vertical slice established several rules worth preserving:

- Merge `store.tokens.json` as a **sparse deep overlay**. A shallow `Object.assign` at the root deletes untouched primitive branches and breaks aliases when a store overrides one value.
- Resolve aliases before emission and fail on missing references or cycles; never emit broken `var()` chains and hope the browser exposes the mistake.
- Keep canonical CSS variables distinct from Tailwind v4 `@theme` aliases. If both use the same name, output such as `--color-action-primary: var(--color-action-primary)` becomes self-referential. A stable internal prefix such as `--design-*` avoids the collision.
- `design:check` must compile in memory and compare expected artifacts without rewriting files. Generated CSS, `DESIGN.md`, and `.impeccable/design.json` should fail together on drift.
- During Tailwind 3→4 migration, a component may consume generated CSS variables through temporary Tailwind 3 semantic aliases while generated output already includes v4-compatible `@theme inline` aliases. Remove the compatibility config only after the v4 build is proven.
- Start with one real component contract test that rejects legacy template names and requires semantic/component roles, accessible focus states, and pointer-target sizing. This proves the taxonomy reaches application code rather than stopping at generated files.

## Preview workflow

1. Payload Design Studio initializes a versioned `design-draft` from canonical tokens and records `baseRevision`.
2. Edits autosave as an admin-only Payload draft; deterministic controls do not invoke Fox.
3. A signed preview session opens a public-route storefront iframe and receives only scoped, schema-validated messages.
4. A validated bridge applies allowlisted CSS-variable overrides to the iframe only.
5. Draft saves never write source, invalidate public runtime state, or deploy.
6. “Request Fox update” creates an immutable, idempotent design event with normalized delta and feedback.
7. Fox validates it and prepares a path-allowlisted, hash-guarded diff in an isolated session worktree.
8. Impeccable Accept keeps a session variant; separate explicit actions approve the diff, commit, open a PR, and deploy through normal controls.

Use a signed preview session carrying `{kind, target, path, expiry}`. Do not rely on one generic draft cookie for both content and theme hooks. Validate `postMessage` origin, source window, and schema.

Existing preview pitfall: `LivePreviewBlocksRenderer` falls back to saved blocks when the live array is empty, so deleting all blocks may preview the old content. Do not copy that fallback behavior into theme preview.

## Agent transport boundary

`scripts/vulpy-agent-cmd-server.py` and `vulpy-agent-cmd.py` support fixed dev lifecycle/status commands only. Preserve that boundary. Do not turn operator text into shell arguments or broaden this server into arbitrary source mutation.

Use a separate typed design-event outbox/API claimed by one Fox worker per session. Start/continue a persisted Hermes conversation through the authenticated Sessions API; keep the Hermes key server-side. Impeccable live events enter through a signed, path-allowlisted relay, not the browser directly. The existing command server is used only for narrow idempotent designer/dev lifecycle commands such as status, restart, session start/stop/clean; HMR is preferable when sufficient.

## Phasing

```text
P0 contract + screenshots
  -> P1 canonical token generator + Tailwind v4 compatibility
     -> P2 shared primitives and semantic component migration
        -> P3 Payload Store Designer + scoped preview
           -> P4 typed Fox request/apply pipeline
              -> P5 remove legacy aliases/config
                 -> P6 controlled rollout
```

Start schema, contrast, generation-drift, and visual tests in P0/P1. Migrate checkout last and give it dedicated functional regression coverage.

## Required quality gates

- deterministic `design:generate` and `design:check`
- token schema, alias, and contrast tests
- generated Payload type/import-map drift checks
- hard-coded design-literal lint with SVG/media allowlists
- Playwright responsive, visual, preview, accessibility, and checkout baselines
- full CSP introduced separately in report-only mode; begin with narrowly scoped same-origin framing policy

## Exact migration surfaces

Foundation:

- `apps/storefront/package.json`, `pnpm-lock.yaml`
- `postcss.config.js`, `tailwind.config.ts`, `src/app/css/style.css`
- `src/app/(site)/layout.tsx`
- root `package.json`, `turbo.json`, `.github/workflows/ci.yml`

Payload/preview:

- `payload.config.ts`, `src/globals/**`, `src/lib/cms/queries.ts`, `src/lib/cms/types.ts`
- `src/middleware.ts`, `next.config.mjs`
- `src/globals/StoreDesigner.ts`
- `src/collections/DesignRequests.ts`
- `src/admin/store-designer/**`
- `src/lib/store-designer/**`
- `src/components/store-designer/ThemePreviewBridge.tsx`
- `src/app/api/store-designer/**`
- generated `payload-types.ts`, admin import map, and a committed Payload migration

## Verification/reporting discipline

For read-only inventories:

- preserve exact paths and package versions
- distinguish verified absence from an inconclusive/truncated search
- report pre-existing Git dirt separately from agent changes
- do not run builds/services when the user requested inspection only
- end with current state, gaps, affected-file matrix, dependency phases, risks, and confirmation that no files were modified
