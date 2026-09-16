---
name: vulpy-medusa-development
description: Use when Hermes must implement or modify Vulpy Commerce backend logic, Medusa workflows, API routes, modules, authentication, integrations, or Admin extensions.
---

# Vulpy Medusa Development

Develop against the existing Vulpy Commerce Medusa architecture rather than treating Medusa as a generic Node application.

## Repository map

- Backend: `apps/medusa-backend`
- API routes: `apps/medusa-backend/src/api`
- Workflows: `apps/medusa-backend/src/workflows`
- Modules: `apps/medusa-backend/src/modules`
- Admin extensions: `apps/medusa-backend/src/admin`
- Configuration: `apps/medusa-backend/medusa-config.ts`

## Required architecture

Use:

`module/service -> workflow -> API route -> SDK consumer`

Do not place mutation business logic directly inside API handlers. Use Medusa workflows and compensating steps for multi-stage mutations.

## Project rules

- Medusa owns products, variants, pricing, inventory, customers, orders, promotions, payments, and fulfillment.
- Payload owns editorial extensions and page content; do not duplicate editorial ownership in Medusa.
- Prices are represented in major units in this project. Never divide values by 100 for display.
- Cart lines require variant IDs, not product IDs.
- Use the Medusa JS SDK for storefront and Admin requests instead of ad hoc `fetch` calls.
- Keep seed operations idempotent.
- For migrations from fixture-heavy seeds to minimal seeds, add a narrowly allowlisted cleanup in the default branch: use Medusa module-service APIs, delete legacy category children before parents, remove only orphaned legacy tags, and preserve separately owned test fixtures. Explicit legacy env modes must bypass cleanup. See `references/safe-idempotent-seed-cleanup.md`. Before committing, re-read the changed files and rerun tests: repository hooks or background factory jobs may rewrite the same files or leave conflict markers after the first verification. Never accept a successful commit hook as proof that the final tree still matches the tested tree.
- Preserve existing payment, search, synchronization, and B2B gating behavior unless the user explicitly requests a change.

## Workflow

1. Default to `dev` and read `.agent/generated-context.md`.
2. Inspect existing modules, workflows, routes, tests, and SDK consumers before adding code.
3. Implement the smallest coherent change.
4. Add or update focused tests.
5. Run the narrowest relevant test and typecheck commands.
6. Verify the consuming storefront or Admin behavior when applicable.

Never deploy or mutate live data without explicit approval.

## Seed idempotency + option/variant upsert contract (verified 2026-08-29)

`updateProducts` is **deep** — it rebuilds options and variants from the input
tuple, so re-running a seed that passes options/variants is idempotent as long
as the intended SKU set is stable. The demo-catalog seed (`demo-catalog.ts`) has
a dedicated `upsertDemoProductMetadata(…, { applyOptionsAndVariants: true })`
path for EXISTING products (was seeded before Finish/Color existed), which adds
the new option values + variants and PRUNES stale variants (SKU not in the
register) with an orphaned-inventory cleanup step. Key rules:

- The metadata-only rerun is a **no-op** for products that already exist unless
  `applyOptionsAndVariants` is explicitly true — a reseed can exit 0 while the
  option data is unchanged. Verify the data actually landed with
  `GET /store/products?fields=options.*,variants.options.*` before debugging
  missing facets.
- The option TITLES matter: the catalog index reads options by title
  (`getVariantOptionValue(variant, "Finish")` / `"Color"` / `"Size"`), so a
  seed that writes `Default`/`One Size` options will NOT populate
  `finishes`/`colors` facade values even though the option rows exist. Match
  the exact case-insensitive title the index looks for.
- **Option-title renames fan out to MANY consumers — audit them all before
  shipping (verified 2026-09-03, Finish→Color).** Renaming a Medusa option
  title (demo catalog `Finish` → `Color`) touches, at minimum: the seed
  product definitions (`demo-catalog.ts` options + EVERY variant tuple
  `options: { Finish: "X" }` + variant titles that embed the color), the
  storefront matchers (`lib/medusa/finish-swatches.ts collectFinishValues`,
  `lib/medusa/mappers.ts getFinishOptionValue` — both keyed on
  `title.includes("finish")`), the backend shop index
  (`modules/shopCatalog/shop-index.ts getVariantOptionValue(record,"Finish")`),
  the swatch registry (`DEMO_FINISH_SWATCH_COLORS` vs
  `DEMO_COLOR_SWATCH_COLORS`), the seed unit tests, and user-facing copy
  (FAQ "different finish" → "different color"). Run
  `grep -rn '"Finish"\|Finish:' apps/medusa-backend/src apps/storefront/src`
  after the seed rewrite and walk every hit.
  **Operator rule (2026-09-03): a rename is a rename — implement it as a
  plain title swap, NOT a dual-shape compatibility shim.** Resist building
  "match finish OR color" fallbacks; the operator explicitly rejected that
  ("we needed just to rename finish to color, that's it, not reinvent the
  wheel"). After the seed rename, the old DB is stale and a reseed is
  REQUIRED for correctness — call that out instead of papering over it.
  The storefront DB reseed happens on the host (`pnpm db:reseed`, NOT
  `pnpm vulpy dev reseed` — that subcommand does not exist) and needs the
  storefront already running at :3000.
- `swatch_color` metadata must be stamped onto the option VALUES (not the
  product) through `updateProductOptionValues`, and only for demo-scoped
  values, so a merchant's own identically-named finishes are never modified.
- **`updateProducts` does NOT create a missing option.** Medusa's deep update
  reconciles options/variants that already EXIST (by title match) but does not
  materialize an option a product never had. This is the Finish-vs-Color trap
  (2026-08-29): after adding Finish+Color to the demo register, reseeding
  updated `Finish` (it pre-existed on placeholder products) but `Color`
  stayed absent on every product, so `/store/shop/facets` returned
  `finishes:[...]` yet `colors:[]` and the sidebar had no Color group — while
  the register clearly defined both. Diagnose per-product, never trust the
  facets endpoint alone: `GET /store/products?fields=options.title` and list
  EVERY product's option titles (one axis can look healthy while the other
  option is missing DB-wide). Fix path: create the missing option and its
  values via `createProductOptions`/`createProductOptionValues` (or a full
  re-create workflow) rather than relying on `updateProducts` deep-update;
  keep the seed idempotent for re-runs (lookup-before-create on
  option-title + value).
- **Facets read `product_variant_option` rows — an existing option is NOT
  enough.** The facets/index accumulator (`entry.colors`, `entry.finishes`)
  iterates VARIANT option-value pairs (`product_variant_option` join), not the
  product's `product_option` rows. After the `createProductOptions` fix, the DB
  can show `Color` as an option AND `levitating-paperweight → Color,Finish`,
  yet the facet stays empty because the VARIANTS still carry only Finish
  (`product_variant_option` for `DEMO-LEV-*` = Finish rows only). Only when the
  variant tuples attach Color (`DEMO-LEV-AB | Finish:Antique Brass,
  Color:River Grey`) does `colors` appear. **DB queries that prove the full
  chain:**
  ```sql
  -- 1. options per product (is the option row there?)
  SELECT p.handle, string_agg(o.title, ',') FROM product_option o
    JOIN product p ON p.id = o.product_id GROUP BY p.handle;
  -- 2. variant-level option VALUE pairs (what the facets actually read)
  SELECT v.sku, string_agg(o.title||':'||ov.value, ',') FROM product_variant_option vvo
    JOIN product_variant v ON v.id = vvo.variant_id
    JOIN product_option_value ov ON ov.id = vvo.option_value_id
    JOIN product_option o ON o.id = ov.option_id
    WHERE v.sku = 'DEMO-LEV-AB' GROUP BY v.sku;
  -- 3. facets count over variants (the index's source)
  SELECT count(*) FROM product_variant_option vvo JOIN product_option_value ov ON ov.id=vvo.option_value_id
    JOIN product_option o ON o.id=ov.option_id WHERE o.title='Color';
  ```
  If (step-1) shows Color but (step-3) counts 0, the option exists but no
  variant attaches it — fix the seed to create options AND re-attach variant
  tuples (the `ensureDemoProductOptions` → then `updateProducts` order works:
  create missing options with values FIRST, then the deep update can attach
  variant tuples to the now-existing option).
- **A reseed that exits 0 can still have failed mid-pipeline.** `store.reseed`
  (and `medusa exec` seed scripts) exit 0 even when a later step died with
  `MedusaError: Product variant with sku: DEMO-LEV-AB, already exists.` — the
  runner swallowed the failure. **Never trust reseed exit codes; grep the log
  for `MedusaError|error|already exists` and re-probe the data** before
  reporting success. This bites hard when the wrong DB was wiped first (see
  vulpy-environment-operations → `references/dev-boot-wedge-agent-cmd-reseed.md`
  for the container-selection trap).
- **Pass `handle` when seeding categories — Medusa slugifies the NAME if you
  don't (verified 2026-09-15).** `getOrCreateProductCategories` forwards the
  category object to `createProductCategoriesWorkflow` VERBATIM — if the
  caller maps only `{name, description, ...}` and drops `handle`, Medusa
  derives the handle from the name. Names with `&` produce
  `orbits-&-orbs`, which breaks storefront URLs (`/categories/orbits-&-orbs`
  → 404 on every category route). The seed's declared `handle: "orbits-orbs"`
  was silently ignored. **Rule: in seed category maps include
  `handle: category.handle` for top-level AND child categories** (the
  `CategorySeedInput.handle?` field exists but is optional — the silent
  drop is the trap). Verify with
  `GET /store/product-categories?fields=name,handle` — if the handle contains
  `-&-`, you found the bug.

## Medusa boot crash triage (error wrapper swallows the real stack)

When Medusa fails at boot with a wrapped error like `Error starting server — An error occurred while registering API Routes. Error: Cannot read properties of undefined (reading 'def')`, the inner stack is intentionally lost (`loaders/api.ts` rethrows `new Error(...)` with only `err.message`). Do not grep Medusa dist for the failing property — the read is usually inside a transitive dep (that `.def` crash is zod 4 vs the zod-3-era RBAC validators).

Full session-tested diagnosis, the `pnpm.packageExtensions` zod fix, and a **standalone repro harness** (`/tmp/repro-api-loader.js` pattern: mock `configManager` from `dist/config/loader.js` + fake container, call `ApiLoader.load()` directly with `sourceDir` = medusa dist/api + project src/api, print `e.stack`) live in `vulpy-environment-operations` → `references/medusa-boot-failure-diagnosis.md`. Copy that harness when a Medusa boot error needs its real stack surfaced.

## Seed file surgery — targeted regex, not custom parsers (verified 2026-09-03)

Rewriting a large structured seed file (`demo-catalog.ts`, ~1000 lines of
product/option/variant literals) via a scripted transform is where silent
corruption happens. This session corrupted the file 3× before landing on the
safe pattern:

- ❌ **Custom brace-parser / char-level scanner in `execute_code`** — the
  in-memory text was rebuilt by hand and repeatedly mangled option-object
  boundaries (duplicate `Color` blocks, stray `{`, doubled `],` closers,
  swallowed `variants:` blocks after single-line `options: [...]`). Symptom:
  `npx tsc --noEmit` reports `TS1136 Property assignment expected` at the
  mangled region.
- ✅ **Targeted multi-line regex on the ORIGINAL git content** — after every
  corruption, `git checkout HEAD -- <file>` restored the pristine source,
  then a single well-scoped regex pass (e.g. one `re.subn` per transform
  kind: paired option blocks, variant tuples, variant titles) landed clean
  on the first try. Regex with explicit anchor context beats a hand-rolled
  parser for flat, deterministic literal shapes.
- **Verify with the compiler AND the tests before trusting the file:**
  `npx tsc --noEmit src/scripts/<file>.ts` for syntax, then
  `npx jest src/scripts/__tests__/<file>.unit.spec.ts` for semantics. A
  transform that "looks right" in a diff can still be structurally broken.
- **`git stash` + re-run tests is the baseline check** — if the same tests
  fail on clean main, the failures are pre-existing, not yours. Run it before
  spending time fixing failures your change didn't introduce.

## Store-visible product tags (Bestseller badge) — via Medusa seed

The card badge system reads Medusa product tags with `show_in_store: true`
metadata (`apps/storefront/src/lib/medusa/product-tags.ts`
`mapVisibleStoreTags` → `ProductStoreTagBadges`). To tag demo products from
the seed:

1. Create the tag once with `getOrCreateProductTag(container, logger, "Bestseller", { show_in_store: true, color: "#eae3d9" })` — the helper is in `seed-helpers.ts` and is idempotent (lookup-before-create, updates metadata only when changed).
2. Attach per product: `listProducts({ handle }, { take: 1, relations: ["tags"] })`, then `updateProducts(product.id, { tag_ids: [...existingTagIds, tag.id] })` — skip if the tag is already attached.
3. `color` metadata drives the badge background (footer taupe `#eae3d9` was used to match the footer surface); `getBadgeTextColor` picks the text color by luminance.
4. Keep the tagged-handle list in one exported const (`DEMO_BESTSELLER_HANDLES`) next to the product definitions so it's discoverable and testable.

## Store customer auth endpoints & B2B price-gating verification (verified 2026-08-11)

### Medusa v2 auth paths — `/store/auth/...` is GONE

Store customer auth in Medusa 2.x lives at **`/auth/{actor_type}/{provider}`**, NOT
`/store/auth/...` (that was the v1 path). A 404/400 on `/store/auth/customer/emailpass`
is EXPECTED — it is NOT evidence of a broken backend. Real paths:

- Login: `POST /auth/customer/emailpass` (bad creds → **401** `Invalid email or password`)
- Register: `POST /auth/customer/emailpass/register`
- Refresh: `POST /auth/token/refresh`; session: `POST /auth/session`; logout: `DELETE /auth/session`

The storefront SDK (`sdk.auth.login("customer","emailpass",...)`) already uses these v2
paths. **Probe technique:** `POST /auth/customer/emailpass` with a dummy email → 401
means the route AND the emailpass provider are alive; only a 404 means auth routes are
genuinely unmounted. The routes ship in `@medusajs/medusa` core
(`dist/api/auth/[actor_type]/[auth_provider]/route.js` — the handler resolves
`Modules.AUTH` at request time); the `@medusajs/auth` package is just the module
(models/service, no API routes). A `medusa-config.ts` WITHOUT an explicit auth module
entry is normal — core registers it; don't treat a missing `modules.auth` as the cause
of a 404.

### Medusa 2.13.0 admin-login regression — `/admin/auth/:actor/:provider` 401s behind the admin auth gate (verified 2026-09-15, demo box)

**Symptom:** Admin login always returns `401 {"message":"Unauthorized"}` — even with
valid credentials and a correct user in the DB. The Admin UI bundle calls
`ge.auth.login("user","emailpass",t)` → `POST /admin/auth/user/emailpass`. Depth-level
probe (`auth.authenticate("emailpass", { body: {email,password} })` via `medusa exec`)
returns `success:true`, but the HTTP route still 401s — even same-origin from inside
the container.

**Root cause (stock framework, not demo config):** `@medusajs/framework` 2.13.0
`routes-loader.js` classifies every route file by its path prefix, and `ADMIN_ROUTE_MATCH
= /(\/admin$|\/admin\/)/` is checked BEFORE `AUTH_ROUTE_MATCH`. So `/admin/auth/...`
routes are typed **admin**, not auth. The auth route file
(`dist/api/auth/[actor_type]/[auth_provider]/route.js`) exports only `POST`/`GET`
handlers — it does NOT export the `AUTHENTICATION_FLAG`, so `shouldAuthenticate = true`
and `optedOutOfAuth = false`. The global admin-auth middleware
(`_ApiLoader_applyAuthMiddleware(routesFinder, "/admin", "user", ...)` in `router.js`)
then runs before the login handler, sees no token/session, and 401s — the login is
unreachable.

**Do NOT chase these red herrings:**
- `/admin/auth/token` (the v1 route) does NOT exist in 2.13 and 401s — but `/admin/auth/user/emailpass` 401s too, so it LOOKS like a credential problem. The SDK's `ge.auth.login("user","emailpass",…)` is the real path.
- `OPTIONS /admin/*` preflights can return 401, not 204 — a sign the admin CORS/auth gate runs on preflight; not the main issue for iframe navigation (iframes don't do CORS).
- Credentials/hash/provider being valid: verify with `medusa exec` module-level `auth.authenticate`, which bypasses the HTTP gate entirely and isolates data-vs-route.

**Fix options (product-code, framework decision):** (1) pin/upgrade Medusa to a version
where auth routes opt out; (2) project-level middleware in `apps/medusa-backend/src/api/middlewares.ts`
that opts `/admin/auth/*` out of authentication; (3) patch framework dist (not durable).
Verify after any fix: `POST /admin/auth/user/emailpass` returns a token.

**Provisioning the Medusa admin user on a deployed box (canonical path, verified 2026-09-15):**
the user is NOT auto-seeded on production-like instances — check first:
`docker exec <medusa> sh -lc 'psql "$DATABASE_URL" -c "select email from \"user\";"'` (0 rows = nobody can ever log in).
Then run the idempotent upsert exactly like `scripts/vulpy-user.sh` does (non-dev path):
```bash
sudo VULPY_ENV=live bash scripts/deploy/prod-compose.sh exec -T \
  -e ADMIN_EMAIL="admin@example.com" -e ADMIN_PASSWORD="<pw>" \
  medusa npx medusa exec ./src/scripts/ensure-admin.ts
```
Pitfalls: `prod-compose.sh` needs `VULPY_ENV_FILE` (defaults to `live` env) and must run as
a user who can write `data/hermes` (root worked); the env vars ONLY reach the container
via the `-e ADMIN_*` flags, not the surrounding shell — omitting them fails with
"ADMIN_EMAIL and ADMIN_PASSWORD ... are required"; `medusa` CLI is NOT on PATH in the
production image (use `npx medusa` from the compose `exec`). After seeding, if HTTP login
still 401s, see the regression above — a seeded user is necessary but NOT sufficient on 2.13.0.

Config (see AGENTS.md gotcha #7): the **storefront bundle flag lives in
`apps/storefront/.env`** — root `.env` alone does NOT reliably reach the Next compile
under the turbo dev stack (verified 2026-08-11); the backend reads root `.env`.

Verify in this order (tenant-box proven, 2026-08-11):

1. **Backend guard:** guest `GET /store/products` with the storefront's exact fields
   (`*variants.calculated_price,*variants.prices`) → **0** price fields; also check
   `/store/shop/facets` (expect `priceMin: 0`).
2. **Positive control (prove prices exist, the guard is stripping them):** count price
   rows directly in the DB, e.g. `psql postgres://medusa:medusa@127.0.0.1:<port>/medusa -c
   "SELECT count(*) FROM price;"` and published products. Non-zero = data present.
3. **Bundle flag:** fetch a served client chunk and grep the compile-time value
   `requireLoginForPrices: "true"` (from `next.config.mjs` `env`). 
4. **Logged-in customers must still see prices** — test with a real customer session.

## Admin SPA origin, iframe slowness, and HMR (verified 2026-08-15)

Full diagnosis + verification recipe: `references/admin-spa-iframe-origin.md`.

- **`admin.backendUrl` MUST default to `"/"`** (same-origin), NOT fall back to
  `MEDUSA_BACKEND_URL`. Baking the public edge URL into `__BACKEND_URL__` makes
  the WebUI iframe call cross-origin → preflights + partitioned localStorage →
  spinner; the direct tab at the public URL is fast (same-origin). The
  "tab fast, iframe slow" asymmetry is the fingerprint.
  `backendUrl: process.env.VITE_MEDUSA_BACKEND_URL || "/"`.
- **Verify at runtime, not in source:** the dashboard exposes
  `window.__sdk.client.config.baseUrl` — must be the page's own origin. Grepping
  `.vite/deps` chunks for `__BACKEND_URL__` shows a raw placeholder (red herring;
  Vite `define` applies at transform time).
- **Design constraint (user, 2026-08-15): Medusa does NOT work well under
  subpaths.** Do NOT propose same-origin path mounts (Tailscale `serve
  --set-path /app`, Caddy path routing) as an iframe fix — the operator
  rejected that direction; apps stay on their own origins/ports. For iframe
  UX (loading bar, clipboard permissions) see `vulpy-webui-extension-development`
  → `references/iframe-embedding-loading-and-clipboard.md`.
- **`.env` changes need a FULL dev restart**, not a watcher reload: the `medusa
  develop` parent loads `.env` at startup; re-forked children inherit the
  parent's env and dotenv never overwrites existing vars. Use
  `pnpm vulpy agent cmd dev.restart` from Fox (direct `pnpm vulpy dev restart`
  is uid-gated), then confirm the new boot in `.tmp/dev/dev.log` before probing.
- **Admin HMR disable** (`MEDUSA_ADMIN_HMR=1` opt-in, default off) kills the
  random-port `wss://…:40xxx` websocket leak. `server.hmr: false` is honored by
  Vite 6.4.1 (no `createHotContext` injection). HTML still includes
  `/@vite/client` even with HMR off — that alone is not proof HMR is on.

## Plugin build & packaging pitfalls (verified 2026-08-08, @vulpy/medusa-plugin-email)

1. **Verify the RIGHT artifact — read `package.json` `exports` first, never assume `dist/`.** `medusa plugin:build` outputs to **`.medusa/server`** (e.g. `packages/medusa-plugin-email/.medusa/server/src/...`), NOT `dist/`. The exports map resolves there (`"./providers/*": "./.medusa/server/src/providers/*/index.js"`); `medusa-config.ts` `resolve: "@vulpy/medusa-plugin-email/providers/email-smtp"` resolves via that map. `ls packages/<plugin>/dist` coming up empty is a RED HERRING — check `.medusa/server`. `.medusa` is gitignored (build artifact).

2. **Plugin build strictness is a live trade-off — the email plugin NEEDS `|| true` for clean installs (re-verified 2026-09-15).** A pristine `pnpm install` compiles the plugin against `@types/react@19.0.12` hoisted from the storefront/Payload lanes; `react-email@6.8.1` components type against React 18's `ReactNode`, so `medusa plugin:build` emits real TS2786 errors (built JS is correct — types only). Strict `prepare`/`build` therefore kills EVERY fresh-box install at `pnpm install`, while warm dev workspaces pass (their node_modules predates the contamination) — the exact trap the 2026-08-08 strictness commit (`ed654d61`, "fail installs loudly") introduced. History: `f5c29e55` added `|| true` → `ed654d61` removed it → clean-box rehearsal (alpha.46) caught the regression → `a7ccd34d` restored `|| true` (2026-09-15). **Rule: keep `|| true` until real type isolation lands (compile the plugin against @types/react@18 without storefront leakage). Never re-strict based on a warm local build — prove strictness via a clean-box install.** While tolerance is in place, don't let it mask REAL build breaks: after install, confirm `.medusa/server/` output exists and check the ambient risk (2026-08-08 hazard: silent `.medusa/server` missing → runtime module-not-found crash). Related env quirk: `medusa` CLI needs a writable `$HOME/.config` — root-owned `/app/.config` in the Hermes container breaks in-container plugin builds with `EACCES mkdir /app/.config/medusa` (host/CI unaffected).

3. **pnpm workspace bin locations.** Root `node_modules/.bin` only carries root tooling (biome, turbo, husky). App bins live at **`apps/<app>/node_modules/.bin`** (`apps/storefront/node_modules/.bin/next`, `apps/medusa-backend/node_modules/.bin/medusa`); shared store bins at `node_modules/.pnpm/node_modules/.bin`. Probe app-level `.bin` when verifying the toolchain is linked — a "missing" root `.bin/esbuild` is normal.
