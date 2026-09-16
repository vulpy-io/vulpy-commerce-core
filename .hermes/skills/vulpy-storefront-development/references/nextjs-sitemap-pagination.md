# Next.js sitemap pagination + sitemap route conflicts (verified 2026-08-27, padelbaza)

Two related problems that surface when a storefront has server-rendered
`?page=N` listing pages: (1) the sitemap doesn't discover pages 2+, and (2) an
orphan sitemap stub breaks every `next build`. Both hit padelbaza
(`bsgdigital/padelbaza`, a padel store on `padelbaza.demojar.com`).

## Verify-before-build: is SSR pagination even missing?

Before writing any code, confirm the claimed gap against the LIVE site and the
repo history — a sibling may already have shipped it:

```bash
# 1. Live probe — is page 2 real server HTML?
curl -sS "https://<shop>/categories/<handle>?page=2" | grep -o 'rel="canonical"[^>]*'
#    expect: canonical href=".../categories/<handle>?page=2"  (not page-1)
curl -sS "https://<shop>/categories/<handle>?page=2" | grep -o '<title>[^<]*'
#    expect a "… – Сторінка 2 / Page 2" suffix → SSR pagination is LIVE
grep -c '/products/[a-z0-9-]*' <(curl -sS "https://<shop>/categories/<handle>?page=2")
#    >0 product links in raw HTML = content is server-rendered, not client-fetched

# 2. History — the clone may be shallow; unshallow before trusting path-limited logs
git fetch --unshallow origin
git log --oneline --follow -- "apps/storefront/src/app/(site)/(pages)/categories/[handle]/page.tsx"
git log --oneline -S "getCategoryCatalogPage" -- apps/storefront/src/lib/medusa/shop-catalog.server.ts
#    "Paginate shop and category catalogs on the server via URL query params" = already done
```

Lesson: the user asked "did the sibling add SSR category pagination?" — it had
been live since an older commit (`fc6a913`). The real gap was discoverability:
the category sitemap shard emitted only the clean URL, no `?page=N`.

Also check `robots.txt` + `SITE_NOINDEX` early. A noindex demo serves an empty
sitemap shard 0 and robots `Disallow: /`; sitemap index URLs 404 by design.
Paginated sitemap work only matters when indexing is enabled — say so plainly
instead of pretending the empty sitemap is the bug.

## The two standard pieces of server-rendered `?page=N` listing pages

Reference implementation (present in padelbaza and the Vulpy template):

- `lib/medusa/shop-catalog.server.ts` — `getShopCatalogPage(searchParams)` /
  `getCategoryCatalogPage(handle, searchParams)` resolve page/filters/sort,
  fetch Medusa with `region_id`, return `{ products, totalCount, currentPage,
  totalPages, pageSize, outOfRange }`.
- `lib/seo/catalog-routing.ts` — `enforceCatalogPagination(catalog, path,
  searchParams)`: redirect `?page=1` → clean URL, `notFound()` when
  `outOfRange`.
- Page components (shop + categories): server component calling
  `getShopCatalogPage`, `generateMetadata` with `canonicalForListing(path,
  currentPage)` + `listingTitleSuffix` (adds "– Page N"), CollectionPage
  JSON-LD, `revalidate = 60`.

The client shell (`ShopWithSidebar` + `useShopCatalogInfiniteScroll`) keeps the
infinite-scroll UX: `initialProducts`/`initialPage` come from the server page,
and `loadShopCatalogPageAction` continues forward from page N. That is the
"hybrid" model: server HTML per page for SEO + infinite scroll for humans.

## Adding paginated URLs to the sitemap

### 1. Pure helpers in `lib/seo/sitemap-shards.ts`

```ts
/** Expand a listing's clean URL into paginated URLs (page 1 stays clean). */
export function paginatedListingUrls(cleanUrl: string, totalPages: number): string[] {
  const urls = [cleanUrl];
  for (let page = 2; page <= totalPages; page += 1) urls.push(`${cleanUrl}?page=${page}`);
  return urls;
}

/** Total listing pages for `count` products at `pageSize` (min 1). */
export function totalListingPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}
```

### 2. Wire the category shard (`app/sitemap/[id]/sitemap.ts`)

- Resolve `regionId` via `getRegionId()`; counts need a real region
  (`listProductsByCategoryIds("", …)` returns `{count: 0}` — a silent no-op).
- `pageSize = getShopPageSize()` (`SHOP_PAGE_SIZE`, default 20).
- Per category: push the clean URL first, then per-category
  `listProductsByCategoryIds(regionId, [category.id], 1, 0)` to get `count`,
  compute `totalPages = Math.min(totalListingPages(count, pageSize), MAX)` with
  `MAX = 50`, and push `paginatedListingUrls(cleanUrl, totalPages).slice(1)`.
- `.catch(() => ({ products: [], count: 0 }))` on the count → clean URL only.
- Keep `lastModified` on the clean URL; paginated entries can omit it.

### 3. Tests + gates

- Unit-test the pure helpers (`paginatedListingUrls`, `totalListingPages`):
  page 1 clean, pages 2..N, zero/one page, partial-rounding.
- Gates used successfully: `pnpm --filter @apps/storefront typecheck`,
  `pnpm --filter @apps/storefront exec vitest run src/lib/seo/sitemap-shards.test.ts`,
  scoped `biome check` on the changed files, and a full `pnpm --filter
  @apps/storefront build` in the worktree (the real gate — CI runs `next build`).
- In worktrees, `pnpm install` can fail on an unrelated package's `prepare`
  script (medusa-plugin-email writes `/app/.config/medusa` → EACCES). Retry
  `pnpm install --ignore-scripts`; the storefront's vitest/tsc binaries already
  landed, so tests still run.

## Sitemap route conflict (orphan stub)

Symptom (every build failing since a refactor):

```
Conflicting route and metadata at /sitemap.xml: route at /sitemap.xml/route and metadata at /sitemap.xml/route
./apps/storefront/src/app/sitemap--route-entry.js: Export default doesn't exist in target module
Did you mean to import generateSitemaps?
```

Cause: `app/sitemap.xml/route.ts` (manual index via `buildSitemapIndexXml`) AND
`app/sitemap.ts` (metadata stub exporting only `generateSitemaps`) both map to
`/sitemap.xml`. Fix: delete the orphan `app/sitemap.ts`. Detection:
`find apps/storefront/src/app -maxdepth 2 -name "sitemap*"` showing both.

Biome lint-staged trap: a `sitemap` dispatch that `return buildX()`s async
builders trips `lint/suspicious/useAwait`. Fix with `return await buildX()`;
never let biome `--unsafe` drop the `async` keyword.