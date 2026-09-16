---
name: vulpy-product-management
description: Use for any Medusa product management task in this Vulpy Commerce shop — create, duplicate, update, bulk-edit, or delete products, variants, prices, categories, tags, sales channels; product search index; Medusa→Payload productContent sync. Load before touching catalog data.
---

# Vulpy Product Management

Operating the product domain (catalog) of this Vulpy Commerce shop: Medusa owns
commerce data, Payload owns editorial `productContent`, the storefront maps via
`apps/storefront/src/lib/medusa/mappers.ts`. Never edit the wrong system.

## Ownership boundaries

| Concern | Owner |
|---|---|
| Products, variants, options, prices, categories, tags, inventory, sales channels, shipping profiles | **Medusa** (`apps/medusa-backend`) |
| PDP editorial blocks (`productContent`), category content | **Payload** (embedded in storefront) |
| Storefront display, search UI, mappers | storefront source |

## Instance + auth defaults

- Default instance: **dev** (host processes). Medusa: `http://host.docker.internal:9000`.
- Admin JWT: `POST /auth/user/emailpass` with the shop admin email/password → `token`,
  then `Authorization: Bearer <token>` on `/admin/*`. Never echo credentials.
- Store API calls need `x-publishable-api-key` from `apps/storefront/.env`
  (`MEDUSA_PUBLISHABLE_KEY`) — never print the key value.

## Where to make changes

- **One-off / bulk data ops** (duplicate, bulk edit, reseed, cleanup): idempotent
  `medusa exec` script under `apps/medusa-backend/src/scripts/` (repo pattern:
  `seed.ts`, `seed-helpers.ts`, `duplicate-products.ts`). Use `createProductsWorkflow` /
  `updateProductsWorkflow` from `@medusajs/medusa/core-flows` or module services —
  mutations in route handlers are a repo anti-pattern.
- **Recurring product features**: custom modules/workflows — load `building-with-medusa`.
- **Single product tweaks**: Medusa admin UI or the admin REST API.

### Running scripts from Fox (pitfalls verified 2026-08-08, issue #106)

Executing `medusa exec ./src/scripts/<script>.ts` inside the Fox container against the
host dev stack needs overrides — `.env` files point at host loopback:

```bash
cd /app/workspace/apps/medusa-backend
export XDG_CONFIG_HOME=/tmp/medusa-config   # CLI wants ~/.config/medusa — /app not writable
DATABASE_URL='postgres://medusa:medusa@host.docker.internal:5432/medusa' \
REDIS_URL='redis://host.docker.internal:6379' \
PAYLOAD_URL='http://host.docker.internal:3000' \
./node_modules/.bin/medusa exec ./src/scripts/<script>.ts
```

1. `localhost` URLs are the **container's** loopback — always override.
2. Exec loads a **Local Event Bus**: `product.created|updated` events do NOT reach the
   running host backend. Consequences:
   - **Search index** (in-memory Orama, 15-min TTL) stays stale — typeahead/search show
     changes only after the next stale-triggered rebuild (≤15 min). No manual trigger exists.
   - **Payload sync** subscriber inside the dying exec process fails (it targets
     `PAYLOAD_URL`). After creating/updating products, re-run the bulk sync with the
     override:
     `PAYLOAD_URL='http://host.docker.internal:3000' ./node_modules/.bin/medusa exec ./src/scripts/sync-products-to-payload.ts`
     (idempotent; watch for `[payload-sync] status=success ... errors=0`).
3. Scripts must resolve link-backed data via the remote query graph — see Pitfalls.

## API reading patterns

- List with fields expansion (handles links like sales channels and prices correctly):
  `GET /admin/products?handle=<handle>&fields=id,title,status,variants.id,variants.sku,variants.prices.amount,variants.prices.currency_code,categories.id,sales_channels.id`
- **`GET /admin/products/:id` takes the `prod_…` id, NOT the handle.** To fetch by
  handle use the list endpoint with `?handle=` (or the store route `/store/products?handle=`).
- Storefront data loaders: `apps/storefront/src/lib/data.ts` (`getStoreProducts`,
  `getShopCatalog`) and `lib/medusa/*` — reuse instead of ad-hoc fetch layers.

## Creating / updating products (workflow input shape)

`CreateProductWorkflowInputDTO` (see `seed.ts` for a working example):

- Product: `title`, `handle` (unique), `status` (`ProductStatus.PUBLISHED|DRAFT`),
  `description`, `images: [{url}]`, `weight/height/width/length`,
  `shipping_profile_id`, `category_ids`, `tag_ids`, `sales_channels: [{id}]`,
  `metadata`.
- Options: `options: [{ title, values: […] }]`.
- Variants: `variants: [{ title, sku, manage_inventory, allow_backorder,
  options: { <OptionTitle>: <value> }, prices: [{ amount, currency_code }] }]`.
- **Prices in this shop are MAJOR units** (seed passes `amount: 10` for $10; the
  storefront `money.ts` treats amounts as major). Copy amounts as-is, never divide by 100
  (AGENTS.md gotcha #1 — shop convention differs from stock Medusa minor-unit default).
- Cart line items need **variant** ids (`variant_…`), never product ids.

## Duplicating products (reference workflow)

Script: `apps/medusa-backend/src/scripts/duplicate-products.ts` (idempotent, skips
existing `<handle>-copy`). Conventions: title `" (copy)"`, handle `-copy`, SKU `-COPY`,
status published, all options/variants/prices/categories/tags/sales channels/images kept,
`metadata.duplicated_from` = source product id. Portable copy:
`templates/duplicate-products.ts` in this skill.

After any duplicate/bulk create: run the payload bulk sync (see above), verify admin
count, spot-check a copy PDP (`/products/<handle>-copy` → 200), and expect search to
catch up within 15 min.

## Payload sync

- Subscriber (backend process) upserts `productContent` on `product.created|updated`;
  bulk fallback: `sync-products-to-payload.ts` (all products) /
  `sync-categories-to-payload.ts` (categories). Idempotent — safe to re-run.
- From Fox always with `PAYLOAD_URL` override (see above). Verify via
  `[payload-sync] status=success … handle=… duration_ms=…` lines and `errors=0`.

## Search index

- `apps/medusa-backend/src/modules/productSearch` — in-memory Orama, 15-min TTL,
  invalidated by product events **within the same process** only. Script-created changes
  appear in `/store/search` after the TTL rebuild. Do not claim search freshness right
  after scripted catalog changes.

## Deleting products

- Admin API `DELETE /admin/products/:id` (soft/hard per payload) or
  `productModuleService.deleteProducts([…])` in a script. Note: Payload `productContent`
  docs are not auto-removed by the sync — cleanup editorial docs separately if needed.
- Bulk deletes: write an idempotent script (list → filter → delete), run from Fox with
  the env overrides, then verify counts.

## Idempotency rules (repo requirement)

1. Lookup by stable key (`handle`) before create; skip/reuse if found.
2. Marker-based batches: check one representative before creating a group.
3. Wrap link-association workflows in `runIdempotentWorkflow` (seed-helpers).
4. Run seed-like scripts twice — second run must log skips and exit 0.

## Pitfalls recap

1. Link-backed fields (`sales_channels`, `shipping_profile`, `variants.prices`) are NOT
   relations on the Product/ProductVariant entities — `listProducts` relations for them
   throw `Entity 'X' does not have property 'y'`. Resolve via
   `query.graph({ entity: "product", fields: ["id", "sales_channels.id", "shipping_profile.id", "variants.prices.amount", "variants.prices.currency_code"] })`.
   See `duplicate-products.ts` for the full pattern.
2. DTO properties backed by getters (e.g. `variantOption.option_id`) do not narrow in
   TS ternaries — copy to a local const first.
3. `medusa exec` from Fox: env overrides + XDG_CONFIG_HOME + local event bus +
   payload sync re-run (issue #106, also in `vulpy-environment-operations`).
4. Never divide amounts by 100; never echo publishable keys or admin credentials.
5. After scripted product changes: payload bulk sync (with override) + expect search TTL.

## Demo catalog: variant images + strip/re-seed traps (2026-08-26)

**Variant thumbnails drive the PDP gallery and product cards — product-level images are
not enough.** `mapMedusaProductToDetail` resolves the gallery from
`variant.thumbnail ?? …` and cards render the selected/first-variant image. A product
created with only `thumbnail` + empty `images[]` shows `$undefined` → broken PDP image
even though the Store API returns a product thumbnail. When creating products whose
variants should each show their own image, set BOTH:

```ts
images: variants.map(v => ({ url: `/images/products/demo/${v.imageFile}` })),  // gallery set
thumbnail: `/images/products/demo/${variants[0].imageFile}`,                    // card fallback
variants: demo.variants.map(v => ({
  // ...
  ...(v.imageFile ? { thumbnail: `${DEMO_IMAGE_DIR}/${v.imageFile}` } : {}),    // ← the one that matters
})),
```

**Strip before re-seed hits two walls** (`strip-demo-catalog.ts`):

1. **Batched category delete fails**: `Deleting ProductCategory (pcat_…) with category
   children is not allowed` — even when the array is ordered children-first, one
   `deleteProductCategories([...ids])` call can hit the parent before its children.
   Delete one-by-one in a loop, children before parent.
2. **Orphaned inventory items block re-seed**: deleting a product does NOT delete its
   inventory items. Re-running the seed then dies inside `createProductsWorkflow` with
   `Inventory item with sku: DEMO-…, already exists` (unique SKU on the orphaned row,
   error surfaces as generic `invalid_data`). Purge `inventory_item WHERE sku LIKE
   'DEMO-%'` BEFORE `deleteProducts` (via `PG_CONNECTION.query(...)` best-effort).

3. **`updateProducts` does NOT create missing options** (2026-08-29): Medusa's
   `updateProducts` deep-update matches options by title and silently DROPS an option
   that has no DB row yet. Re-seeding a pre-Color DB (Finish-only products) left
   `Color` absent → `colors: []` facet forever. The fix pattern
   (`seed-demo-catalog.ts` `ensureDemoProductOptions`): list the product's existing
   options, `createProductOptions` for any missing titles (idempotent — skip titles
   already present), THEN `updateProducts`. Also: prune stale variants BEFORE the
   deep-update so orphaned SKUs don't collide with the intended set
   (`Product variant with sku: DEMO-LEV-AB, already exists` on a partially-seeded DB).

**Verify by rendered output, not seed exit code.** After any catalog (re-)seed, audit
the actual pages: `curl` each key route (`/`, `/shop`, two PDPs, category register),
count distinct `images/products/demo/*.jpg` refs and grep `placeholder.svg` — expect 0
placeholders on demo pages. A seed exiting 0 proves nothing about what renders.
Test-fixture products (e.g. `checkout-e2e-product`) may still carry placeholders on
shared pages — give them a real image too.

## Verification checklist

- [ ] Admin API shows expected product count and fields (`GET /admin/products?limit=…`)
- [ ] Spot-check PDP via storefront: `curl -o /dev/null -w '%{http_code}' http://host.docker.internal:3000/products/<handle>` → 200
- [ ] `[payload-sync] status=success … errors=0` in bulk sync output
- [ ] Search/typeahead shows changes (≤15 min after scripted changes)
- [ ] Sales channel / category / price spot-check on one product via fields expansion
