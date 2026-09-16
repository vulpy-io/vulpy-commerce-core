# Vulpy Commerce — Storefront

Next.js 16 App Router storefront with an embedded Payload CMS (`@apps/storefront`).
Commerce runs on Medusa v2 (`@apps/medusa-backend`); Payload owns editorial
content (pages, posts, navigation, footer, site settings).

## Quick start (monorepo)

```bash
pnpm bootstrap    # from the repo root: env files, deps, Postgres, migrate, seed
pnpm dev          # storefront on :3000, Medusa API on :9000
```

Storefront admin UI: http://localhost:3000/admin (Payload)
Medusa admin: http://localhost:9000/app

## Layout

- `src/app/(site)/` — public routes (shop, cart, checkout, PDP, auth)
- `src/app/actions/` — server actions (cart, checkout, customer, order)
- `src/collections/`, `src/globals/` — Payload data model
- `src/components/cms/` — CMS block renderers
- `src/lib/medusa/` — Medusa SDK integration
- `src/lib/analytics/` — consent-gated Matomo adapter
- `design/` — DTCG design tokens → generated CSS (`src/app/css/tokens.generated.css`)

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (via root turbo) |
| `pnpm build` | Production build |
| `pnpm test` | Vitest unit tests |
| `pnpm typecheck` | TypeScript strict check |
| `pnpm seed` | Seed Payload CMS content (dev server must be running) |
| `pnpm generate` | Regenerate Payload types + import map |

See the repo-root AGENTS.md for architecture rules, env vars, and gotchas.
