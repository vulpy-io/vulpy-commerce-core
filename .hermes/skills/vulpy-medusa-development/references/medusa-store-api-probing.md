# Medusa store API probing — publishable-key gotchas (2026-09-01)

Debugging "products: 0 / store empty" during install verification wasted a
round-trip. The signal was a false alarm, but the path to the truth is reusable.

## The traps

1. **Bare `GET /store/products` returns 400, not products.** Medusa store
   endpoints need query params (`region_id`, `fields`, ...) AND a publishable
   key header. A bare curl gets `400` with an error body; parsing it for
   `products` yields `0` — which looks like data loss but isn't.

2. **Two different key identifiers.** The `api_key` DB table stores ids
   prefixed `apk_...` (e.g. `apk_01M1EXDG...`). The storefront env
   (`MEDUSA_PUBLISHABLE_KEY`) holds a `pk_...` value. Sending the DB id as
   `x-publishable-api-key` gives `400 {"type":"not_allowed","message":"A valid
   publishable key is required..."}`. Use the env value, not the DB row.

3. **SSR page is the authoritative presence check.** If the shop page
   server-renders product titles (T-Shirt, Sweatshirt, ...), the stack works —
   a failing raw API curl does not override that evidence.

## Correct probe

```bash
SFK=$(grep -E "^MEDUSA_PUBLISHABLE_KEY=" apps/storefront/.env | cut -d= -f2- | tr -d '"')
REGION=$(docker exec <pg> psql -U medusa -d medusa -tAc "select id from region limit 1" | tr -d " ")
curl -s -H "x-publishable-api-key: $SFK" \
  "http://localhost:9000/store/products?fields=id%2Ctitle&region_id=$REGION" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('products',[])), [p.get('title') for p in d.get('products',[])[:4]])"
```

Or just trust the DB count (`select count(*) from product`) + the rendered shop
page — three-way verification, same as the seed discipline.
