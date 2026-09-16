# Adding or changing a CMS SiteSettings field

Every storefront-level setting lives in Payload's `site-settings` global and flows through FIVE files — miss one and the field silently drops (type errors, empty fallback, or never reaches components):

1. `apps/storefront/src/lib/cms/types.ts` — `CmsSiteSettings` type. Make new fields optional.
2. `apps/storefront/src/globals/index.ts` — `SiteSettings` GlobalConfig field. Reuse an existing `f.*` admin-label key when one fits; otherwise inline the label string — do NOT invent a key the i18n `admin-labels` object lacks (TS will not catch it and the label renders raw).
3. `apps/storefront/src/lib/cms/defaults.ts` — seed default. This is what empty-DB bootstraps AND CMS-failure fallback render, so keep the copy voice consistent with the rest of the seed. Update `defaults.test.ts` when defaults change.
4. `apps/storefront/src/lib/cms/queries.ts` — `mapSiteSettings()` maps the Payload doc row → typed setting; without this the value never reaches components.
5. `apps/storefront/src/lib/cms/fallback.ts` — `emptySiteSettings` (TS forces this once the type gains the field; arrays default `[]`).

## Template voice rule (seed copy)

When the operator says the work is for the Vulpy Commerce TEMPLATE (not a store deployment), the seed defaults are also the CMS-failure fallback voice — never port reference-site-specific copy. The demo catalog sells levitating objects, so the top bar tagline is "Small-batch objects, delivered worldwide" — NOT Hector Finch's "Handcrafted in Britain".

## Worked example (2026-09-03, two-bar navbar)

`topBarText?: string` + `topBarLinks?: { label, url }[]` added across types → global (one text + one array field) → defaults → mapSiteSettings → fallback in one coder pass.

## Verifying storefront changes from the Hermes container

First-pass proof the dev server picked up a merge: `curl -s http://host.docker.internal:3000/ | grep` the new SSR class/string. When driving the host dev server with headless Playwright from the container, `_next/webpack-hmr` WebSocket console errors are expected noise (the container can't join the host's HMR socket) — ignore them; real failures are `pageerror`s.
