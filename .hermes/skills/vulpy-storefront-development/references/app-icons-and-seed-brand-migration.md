# Storefront application icons and seed-brand migration

Use this pattern for a storefront product-name or application-icon rebrand that spans Next.js metadata and embedded Payload CMS state.

## Next.js App Router icon set

Keep the canonical icon geometry identical across formats and use App Router metadata conventions:

- `src/app/favicon.ico` — multi-size ICO (at least 16, 32, 48; preferably through 256).
- `src/app/icon.svg` — scalable browser icon.
- `src/app/icon.png` — explicit 32×32 PNG.
- `src/app/apple-icon.png` — 180×180 Apple touch icon.
- `public/icon-192.png` and `public/icon-512.png` — PWA assets.
- `src/app/manifest.ts` — product `name`, `short_name`, description, and PWA icon references.

A production `next build` should emit routes for `/favicon.ico`, `/icon.svg`, `/icon.png`, `/apple-icon.png`, and `/manifest.webmanifest`. Inspect `.next/app-path-routes-manifest.json` if the summarized route table omits a metadata route.

## Title migration surfaces

A complete rebrand includes:

1. Site layout fallback metadata.
2. Utility-page fallback titles.
3. Shared CMS defaults.
4. Payload global schema defaults.
5. Fresh seed defaults.
6. Existing seed data carrying the exact legacy default.

Do not broadly replace technology/vendor names when only the storefront product name changes.

## Idempotent Payload hotfix

Extract the legacy-brand transform into a pure tested helper. Recursively transform only the title-bearing slice of the existing global, such as:

- `siteName`
- `defaultSeo`
- `utilityPageSeo`

Then:

1. Read the current global after normal fresh-seed setup.
2. Transform only the selected branding fields.
3. Compare before/after values.
4. Skip if unchanged.
5. Submit only the transformed slice to `updateGlobal`.

This updates old defaults while preserving unrelated CMS configuration and custom titles. Retaining the legacy literal in this narrowly scoped detector and its regression test is expected; user-visible and fallback source should otherwise have zero occurrences.

## Verification

- Unit-test legacy replacement, unrelated custom-value preservation, nested arrays/objects, and idempotence.
- Run scoped Biome and storefront typecheck.
- Validate SVG hash and exact equality across canonical copies.
- Validate PNG dimensions/mode and ICO embedded sizes.
- Run `next build`; a database connection warning can be reported separately if compilation, metadata route generation, and the command itself succeed.
- Scan for the legacy product name and classify every remaining match; detector/test-only matches are acceptable, user-visible matches are not.
