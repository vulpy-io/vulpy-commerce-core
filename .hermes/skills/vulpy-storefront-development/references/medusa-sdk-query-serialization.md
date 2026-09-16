# Medusa JS SDK query serialization (`skipNulls`) & category-tree duplicates

## The trap

`@medusajs/js-sdk` serializes query params with
`qs.stringify({ ...params }, { skipNulls: true })`
(`node_modules/.pnpm/@medusajs+js-sdk@*/node_modules/@medusajs/js-sdk/dist/client.js`, ~line 250).
**Any `null` param value is silently dropped from the request.**

Concrete failure (Hector Finch, 2026-08): `listCategoryTree()` called
`medusa.store.category.list({ parent_category_id: null, include_descendants_tree: true, ... })`.
The SDK sent NO `parent_category_id` filter, so the Store API returned ALL categories as
top-level nodes, each with its full descendant tree attached. Every category appeared twice —
once as a root, once nested under its real parent (11 duplicate id hits in a tree walk).

## Symptoms

- Home category tiles duplicate: `Encountered two children with the same key, pcat_…`
  (key = `medusaId` from `mapStoreCategoryToDisplay`).
- Any tree walk finds the same category N times: `getCategoriesByHandles`,
  `getDeepestProductCategory`, `buildProductBreadcrumbTrail`, `resolveCategoryScopeIds`.
- **Raw curl of the same endpoint looks CLEAN** — curl sends `parent_category_id=null`
  literally and the API honors the string `"null"` (returns only the real roots). The bug
  only appears through the SDK. This sent debugging down a long false path (stale-build
  theories, dev-server restarts) before the SDK was replicated directly.

## Debugging lesson: curl ≠ SDK

When a storefront data bug doesn't reproduce with curl, replicate the exact SDK call in a
standalone script — the SDK is the only faithful client:

```bash
cd /app/workspace/apps/storefront
cp /tmp/repro.mjs ./repro.mts   # .mts so tsx handles it
node /app/workspace/node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs ./repro.mts
rm ./repro.mts
```

- The SDK ESM build has directory imports plain Node can't resolve; use `createRequire`
  to load the CJS build: `const { default: Medusa } = require("@medusajs/js-sdk")`.
- From the Hermes container, baseUrl = `http://host.docker.internal:19100` (host dev API);
  on the host it is `http://127.0.0.1:19100`.
- Read `MEDUSA_PUBLISHABLE_KEY` from `apps/storefront/.env` (never echo it).

## Fix pattern (applied 2026-08)

`parent_category_id: null` cannot express "roots only" through the SDK. Filter client-side —
the response already carries `parent_category_id` on every node:

```ts
export const listCategoryTree = cache(async () => {
  const medusa = await getMedusaClient();
  const { product_categories } = await medusa.store.category.list({
    parent_category_id: null,
    include_descendants_tree: true,
    fields: "+metadata",
    limit: 100,
  });
  return product_categories.filter((category) => !category.parent_category_id);
});
```

Top-level nodes failing the filter are non-root categories; their real root (with the full
descendant tree) is already in the response, so the walk stays complete and duplicate-free.

General rule: any `null` query param through the SDK is dropped. Either omit the param and
filter client-side, or pass the literal string `"null"` where the API accepts it (magic
string, API-specific — prefer the client-side filter).

## Verifying server-rendered output (RSC flight payload)

To see EXACTLY what the server rendered (not what you assume it should render), parse the
flight chunks from the page HTML and pull the keyed elements in order:

```python
import re
html = open('home.html').read()
chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.S)
data = ''.join(chunks).replace('\\"', '"')
re.findall(r'"\$Le3","(pcat_[A-Z0-9]+)"', data)    # keys in render order
re.findall(r'"href":"(/categories/[^"]+)"', data)  # hrefs in render order
```

Duplicate keys in that list = duplicate entries in the prop array, before React ever
complains in the browser console.
