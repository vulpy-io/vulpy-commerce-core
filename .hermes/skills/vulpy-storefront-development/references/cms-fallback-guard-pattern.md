# CMS fallback guard pattern — demo seed markers and Payload query failure handling

## What this is

The storefront has a **three-layer fallback architecture** for Payload CMS data:

1. **CRM DB** — A Payload global/collection returns real data from the database query.
2. **Defaults layer** (`defaults.ts`) — Seed/demo content for local empty-DB bootstraps (contains "PimjoLabs", "James Septimus" and other NextMerce demo markers).
3. **Empty safety shell** (`fallback.ts` — `emptySiteSettings`, `emptyNavigation`, `emptyFooter`) — Stripped-safe content with no brand names, phone numbers, or demo copy.

A guard function `cmsDefaultsAllowed()` in `fallback.ts` controls whether layer 2 (defaults) is permitted. The guard returns:
- `false` in `NODE_ENV=production` (unless `CMS_ALLOW_DEFAULTS=1`)
- `true` in non-production and `undefined`/missing NODE_ENV
- Can be explicitly set via `CMS_ALLOW_DEFAULTS=0` or `=1`

## The gotcha: per-field fallbacks can bypass the guard

The top-level functions (`getSiteSettings`, `getNavigation`, `getFooter`) correctly check `cmsDefaultsAllowed()` when the entire Payload query fails or returns null. But there are **two deeper leak paths** that also need guarding:

### Path 1: Partial-doc per-field fallbacks in `mapSiteSettings`

When Payload returns a **partial** doc (site-settings global exists but has null/empty fields), `mapSiteSettings` was using `|| defaultSiteSettings.xxx` on every field unconditionally:

```ts
// ❌ Leaks through — in production with a partial Payload doc:
contactName: contactInfo.contactName || defaultSiteSettings.contactInfo.contactName,  // "James Septimus"
copyright: (doc.copyright as string) || defaultSiteSettings.copyright,                  // "PimjoLabs"
```

Fix pattern — gate the defaults reference:
```ts
const allowDefaults = cmsDefaultsAllowed();
contactName: contactInfo.contactName || (allowDefaults ? defaultSiteSettings.contactInfo.contactName : ""),
```

### Path 2: `getPageBySlug` unconditional `defaultPages[slug]`

Three locations in `getPageBySlug` returned `defaultPages[slug]` unconditionally:
- Payload client was null
- Payload returned no matching doc
- The try/catch block

The "contact" default page includes `contactName: "James Septimus"` via `defaultSiteSettings.contactInfo.contactName`.

Fix pattern:
```ts
return (cmsDefaultsAllowed() ? defaultPages[slug] : null) ?? null;
```

### Path 3: `mapPaymentMethods` unconditional default fallback

Even though `defaultPaymentMethods` has generic alt text (not seed markers), the unconditional fallback could render payment icons in production when Payload returns no payment methods.

## How to audit for future leak paths

Whenever adding a new CMS query or mapping function in `queries.ts`, ask:

1. **Does this function have a fallback to `defaults.ts`?** If yes, gate it with `cmsDefaultsAllowed()`.
2. **Does this function do per-field `|| defaultSiteSettings.xxx`?** If yes, every field needs `allowDefaults ? ... : ""/[]` so partial Payload returns don't leak demo content.
3. **Does this function return `defaultPages[slug]`?** If yes, gate it.

The `emptySiteSettings`, `emptyNavigation`, and `emptyFooter` exports in `fallback.ts` are the safe production defaults — use these when `cmsDefaultsAllowed()` is false.

## Files involved

- `apps/storefront/src/lib/cms/defaults.ts` — seed content (demo markers live here)
- `apps/storefront/src/lib/cms/fallback.ts` — guard function + empty safety shells
- `apps/storefront/src/lib/cms/queries.ts` — all Payload query + mapping functions (the fix surface)
- `apps/storefront/src/lib/cms/fallback.test.ts` — tests for the guard + marker detection

## Verification

After changes to fallback paths:
1. Run `cd apps/storefront && npx vitest run src/lib/cms/fallback.test.ts`
2. Grep for `defaultSiteSettings` and `defaultPages` in `queries.ts` — every reference that's a fallback should be guarded.
3. Grep for `defaultPaymentMethods` in `queries.ts` — the one fallback reference should be guarded.