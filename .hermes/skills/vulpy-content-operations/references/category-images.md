# Category images = Medusa metadata (image_url)

Category images on the storefront are **not** stored in Payload. Each Medusa category
carries `metadata.image_url`; `getCategoryImageUrl()` in
`apps/storefront/src/lib/medusa/category-display.ts` resolves it (relative paths get
`NEXT_PUBLIC_MEDUSA_ASSET_URL` prepended, absolute URLs pass through, `/images/...` storefront
paths stay as-is). The `Categories` component renders these for homepage category cards and
subcategory thumbs on `/categories/<handle>` pages.

## Set every category's image to its first product (latest listing order)

Verified 2026-08-08 against dev (Medusa v2.13). All calls go through the Medusa **admin** API.

1. **Admin login (Medusa v2):** `POST /auth/user/emailpass` with the seed admin
   (`admin@example.com` / `supersecret` in dev) → `{token}`. Bearer-auth every later call.
2. **Category tree:** `GET /admin/product-categories?include_descendants_tree=true&limit=100`.
   Categories can appear both at root AND nested under a parent (e.g. Shirts/Sweatshirts/Pants
   under Apparel) — de-dupe by id. Not every category has `category_children` populated even
   when the seed docs mention L3 children; check the live tree.
3. **First product per category:** `GET /admin/products?category_id[]=<scope>&limit=1&order=-created_at&fields=id,title,thumbnail`
   where `<scope>` = category id + all descendant ids. `category_id[]` matches **direct**
   membership only — pass the descendant scope explicitly. `order=-created_at` mirrors the
   storefront's default `sort=latest`.
4. **Update:** `POST /admin/product-categories/:id` with `{"metadata": <merged>}` — **POST, not
   PATCH** (Medusa v2 admin update verbs use POST). Merge `image_url` into the existing metadata
   object — `seo_title`, `seo_description`, `nav_all_label` etc. must survive; the API replaces
   the whole metadata map.
5. **Verify:** store API `GET /store/product-categories?handle=<h>&fields=+metadata` with
   `x-publishable-api-key` header shows the new value; then grep rendered HTML of the homepage
   and `/categories/<parent>` for the product image URL in category cards/thumbs.

The product `thumbnail` value can be stored as-is (absolute S3 URL or relative path) —
`resolveMedusaAssetUrl` handles both formats.

## Notes

- Categories with no products (direct or descendant) render no thumb anyway; skip them.
- "First product" = what the customer sees first on the category page (default `latest` sort).
  If a different sort is the shop default, change `order` accordingly.
- Idempotent: re-running with the same mapping overwrites the same `image_url` key.
