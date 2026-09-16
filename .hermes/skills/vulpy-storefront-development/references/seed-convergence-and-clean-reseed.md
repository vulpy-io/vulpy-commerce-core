# Seed convergence and clean-reseed verification

## Durable rules

- A seed constant change does not rename an existing Medusa category. Pass canonical `handle` values into the category seed input and reconcile `existing.handle` during reruns. For top-level categories, pass `parent_category_id: null` explicitly; distinguish omitted from explicit null so old nesting is repaired.
- Category handles must be URL-safe slugs. `Orbits & Orbs` uses `orbits-orbs`, never `orbits-&-orbs`. Verify the storefront route returns 200 and the Medusa store API returns the canonical handle.
- Seeded editorial records need convergence, not create-only idempotency. Remove deprecated posts/pages, update desired records whose media or copy changed, and make stale-record cleanup idempotent because concurrent seed requests can race on deletion.
- Product/category thumbnails can point at real product assets, but verify the files exist under `public/images/products/demo/` before calling `ensureMedia`; a missing asset can silently create a post/category with no image.

## Clean reseed workflow

1. Apply code changes and run storefront/Medusa typechecks and focused seed tests.
2. Use the supported host bridge (`corepack pnpm vulpy agent cmd store.reseed`), not Docker/database commands inside Fox.
3. Treat the reseed exit code as necessary but insufficient evidence. Query Payload APIs for navigation, site-settings, footer, pages, and posts; query Medusa with the publishable key for categories and parent relationships.
4. Verify exact invariants:
   - top bar labels/order;
   - custom navigation labels/order, with Medusa categories merged separately;
   - footer legal links and absence of deprecated FAQ/press links;
   - exactly the intended seeded blog posts, each with a non-null media relation;
   - deprecated pages/posts absent;
   - canonical category route returns 200, old malformed-handle route is not used;
   - category `metadata.image_url` points to real product images.
5. If a seed error occurs, inspect the storefront seed log for the exact Payload operation. Do not rerun blindly after a partial reset; fix the failing convergence path first, then run the supported reseed once more.

## Client-only UI verification

The mobile burger is not reliable in SSR page HTML: it is a client component whose open markup is absent while closed. Never validate it by grepping a page dump or counting class strings from unrelated markup. Render `MobileMenu` with `navigationOpen=true` using `renderToStaticMarkup` and inspect actual `<a>`/`<button>` classes. Assert:

- leaf and grouped first-level rows share typography and left edge;
- grouped/accordion parents have no active/hover underline when the design calls for none;
- second/third-level rows have the same typography as first-level, with indentation as the only hierarchy difference;
- submenu rows do not contain duplicated utility classes.

For rendered UI chrome that is gated behind `SiteLayoutClient`, verify the hydrated route or served CSS/API output, not only the initial SSR shell.
