# Seed option rename + CMS block removal — working recipes

Verified 2026-09-03 on the Fox in the Box demo catalog (Finish → Color merge).

## 1. Payload block removal wedges dev boot (read first)

Removing a block slug from a `blocks` field (e.g. deleting `productGrid` from
`productPageBlocks` in `apps/storefront/src/blocks/index.ts`) orphans DB tables
named `<collection>_blocks_<slug>` and `_<collection>_v_blocks_<slug>`
(e.g. `product_content_blocks_product_grid`, `_product_content_v_blocks_product_grid`).

On the next `pnpm vulpy dev up` the Payload dev-push detects the tables as
"about to be deleted" and prompts:

```
? Warnings detected during schema push:
· You're about to delete product_content_blocks_product_grid table with 16 items
DATA LOSS WARNING: Possible data loss detected if schema is pushed.
```

Non-TTY stdin → `prompts` returns undefined → `process.exit(0)` → the host
wedge detector sees a failed boot and loops "Wedged boot detected — clearing
full .next and retrying once…". The storefront can still answer requests in
that state (Medusa traffic in the log) while `/health` 404s and `dev.status`
reports stale/partial.

**Fix options:**
1. Drop the orphaned tables, then `dev up`:
   ```bash
   docker exec vulpy-commerce-dev-postgres-1 psql -U medusa -d payload \
     -c "DROP TABLE IF EXISTS product_content_blocks_product_grid CASCADE; \
         DROP TABLE IF EXISTS _product_content_v_blocks_product_grid CASCADE;"
   ```
   (container name pattern: `vulpy-commerce-dev-postgres-1` for dev; adjust per instance)
2. **Full reseed** — nukes the Payload DB, rebuilds from current schema → no
   orphans → no prompt. `pnpm vulpy dev reseed` is NOT a subcommand; the host
   scripts are `scripts/db-reseed.sh` (which calls `db-reset.sh` internally)
   and `pnpm db:reseed` / `pnpm db:reset` at repo root.
3. Do NOT write a "drop the table" Payload migration just to unblock dev —
   reseed handles it and the migration is dead weight.

**Gotchas:**
- `pnpm vulpy dev down` does NOT wipe the DB — it only stops app daemons.
- `store.reseed` through the agent-cmd bridge times out (300s ceiling) on a
  full reseed — run reseed/reset on the host, not through the bridge.
- When dev is wedged on this prompt, the schema push has not run, so the
  old tables are still live — dropping them is always safe (they hold only
  orphaned block rows for a removed block).

## 2. Renaming a Medusa product option title across the seed + logic

Classic rename (Finish → Color): the option title lives in the demo catalog
seed, the variant tuples, the swatch registry, the facet mappers, the backend
shop-index, AND the unit tests. Miss any one and a facet silently goes empty
or a swatch disappears.

### Technique: regex pair-collapse on the seed (proven)

`apps/medusa-backend/src/scripts/demo-catalog.ts` uses two option shapes:
multi-line objects and single-line objects. Handle both with targeted regexes,
NOT a generic brace parser (two generic-parser attempts corrupted the file).

```python
import re
src = open(path).read()

# 1) Multi-line pair: Finish block + Color block -> single Color block
multi_pair = re.compile(
    r'\{\s*\n(\s*)title: "Finish",\s*\n\s*values: (\[[^\]]*\]),\s*\n\s*\},'
    r'\s*\n\s*\{\s*\n\s*title: "Color",\s*\n\s*values: \[[^\]]*\],\s*\n\s*\},',
    re.DOTALL,
)
src = multi_pair.subn(lambda m: ('{\n%s  title: "Color",\n%s  values: %s,\n%s},'
    % (m.group(1), m.group(1), m.group(2), m.group(1))), src)[0]

# 2) Single-line pair
single_pair = re.compile(
    r'\{\s*title: "Finish",\s*values: (\[[^\]]*\])\s*\},\s*\n?\s*\{\s*title: "Color",\s*values: \[[^\]]*\]\s*\},?'
)
src = single_pair.subn(lambda m: '{\n        title: "Color",\n        values: %s,\n      },' % m.group(1), src)[0]

# 3) Variant tuples: options: { Finish: "X", Color: "Y" } -> { Color: "X" }
src = re.subn(r'options:\s*\{\s*Finish:\s*"([^"]*)",\s*Color:\s*"[^"]*"\s*\}',
              lambda m: 'options: { Color: "%s" }' % m.group(1), src)[0]

# 4) Variant titles "X · Y" -> "X"
src = re.subn(r'title:\s*"([^"]+) · [^"]+"',
              lambda m: 'title: "%s"' % m.group(1), src)[0]
```

Then VERIFY with `npx tsc --noEmit src/scripts/demo-catalog.ts` (module
resolution errors for `@medusajs/*` are pre-existing noise; real syntax errors
are the signal) and run the unit spec.

### Pitfalls (all hit this session)

1. **Char-scanning brace parsers corrupted the file twice.** A naive
   `options: [` → `],` collector swallowed single-line arrays' closing
   bracket and ate following `variants:` blocks. A second object-span
   rebuild flattened formatting and dropped object boundaries. Use the
   regex pair-collapse — the seed's option pairs are deterministic.
2. **`write_file` on large files silently truncates.** Never read a large
   file via `read_file` (paginated) and write it back whole. Always targeted
   `patch` or scripted single-rewrite with a verify step. Symptom:
   `Expected '</', got '<eof>'` at the last visible line.
3. **After renaming, the matcher functions must follow.** `collectFinishValues`
   and `getFinishOptionValue` in `apps/storefront/src/lib/medusa/` key on
   `title.includes("finish")`. When the seed option becomes "Color", broaden
   to `title.includes("finish") || title.includes("color")` or the facet
   goes empty. Backend `shop-index.ts` reads `getVariantOptionValue(record,
   "Finish")` — change to `Color` first with `?? Finish` fallback for legacy
   rows.
4. **Display-label shim is a separate surface.** PDP `VariantOptions.tsx`
   shows `isFinish ? "Color" : option.title` — keep the swatch gate matching
   BOTH `finish` and `color` titles (`isSwatchOption = isFinish || isColor`)
   or swatches vanish after the seed rename.
5. **Swatch color map must absorb the renamed values.** `DEMO_COLOR_SWATCH_COLORS`
   needed the former finish palette added; the seed unit test asserts every
   Color option value has a registered hex.
6. **Unit tests reference the old model in multiple places.** Search the spec
   for the old title (`grep -n 'Finish'`) — assertions on option arrays,
   variant tuples, fixture products, and describe-block names all need the
   merge. Verify against clean main via `git stash` if unsure a failure is
   yours: `git stash && npx jest <spec> && git stash pop`.
7. **Product cards + PDP use dead `text-md`.** `text-md` was never in the
   Tailwind `@theme`, so `className="font-normal text-md"` silently rendered
   at inherited size — the "unbalanced" card prices. Use an explicit
   `text-[15px]` + `font-medium text-content-primary` for card prices.
