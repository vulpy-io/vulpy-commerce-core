# Vulpy Commerce

**→ [vulpy.io/commerce](https://vulpy.io/commerce)** — product site, docs, and
pricing for Vulpy Commerce.

Vulpy Commerce is an **AI-run shop**: the open-source Medusa v2 + Next.js +
Payload CMS ecommerce stack, operated by **Fox**, the built-in AI assistant
(Hermes agent + Vulpy WebUI). Fox sets up the store, runs it day to day
(catalog, content, orders, analytics), and guides you through setup and ongoing
operation.

- **Core** — free, public edition.
- **Starter Pack** and **Multi-Agent Pack** — paid add-ons.
- **Pro** — private commercial edition, includes both add-ons.

Portable monorepo; use this repo as the upstream, each shop is a copy with its
own `.data/` directory and `COMPOSE_PROJECT_NAME`. See [TEMPLATE.md](TEMPLATE.md)
for creating a new shop and VPS deployment.

## Tech Stack

- Next.js storefront (`@apps/storefront`) — NextMerce UI + Medusa + Payload CMS
- Medusa v2 backend + PostgreSQL + Redis (Docker)
- Self-hosted Matomo (production) — consent-gated ecommerce analytics; see `AGENTS.md` and `deploy/README.md`
- In-process Orama product search (Medusa `productSearch` module)

## Prerequisites

- Node.js 22 LTS (20+ supported)
- pnpm 10.15.0
- Docker (Compose plugin)

## Quick Start

```bash
pnpm bootstrap    # env files, pnpm install, DB, migrate, seed, admin, publishable key
pnpm dev

# In another terminal, while dev is running:
pnpm --filter @apps/storefront seed   # Payload CMS content
```

| Service | URL |
|---------|-----|
| **Fox (Vulpy WebUI)** | http://localhost:8787 |
| Storefront | http://localhost:3000 |
| Payload Admin | http://localhost:3000/admin |
| Medusa API | http://localhost:9000 |
| Medusa Admin | http://localhost:9000/app |

## Data layout

All Docker persistence lives under `.data/` (gitignored):

```
.data/
├── postgres/       # PostgreSQL (dev + prod)
├── redis/
├── medusa-static/  # prod uploads
├── payload-media/  # prod CMS media
├── matomo/         # prod Matomo app files
├── matomo-db/      # prod Matomo MariaDB
└── ...
```

On NTFS/exFAT hosts (e.g. `/mnt/data`), Postgres, Redis, and Matomo (app + MariaDB) auto-fall back to `~/.local/share/<project>/…`. Override with `POSTGRES_DATA_DIR` / `REDIS_DATA_DIR` / `MATOMO_DATA_DIR` / `MATOMO_DB_DATA_DIR` in `.env`.

`COMPOSE_PROJECT_NAME` defaults to the folder name so multiple shops can run on one machine without container conflicts.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm bootstrap` | Full bootstrap: env, install, DB, migrate, seed, admin, publishable key |
| `pnpm bootstrap:env` | Copy `.env` files only (no Docker) |
| `./scripts/init-project.sh` | Same as `pnpm bootstrap` |
| `pnpm db:up` | Start PostgreSQL + Redis |
| `pnpm db:hermes:up` | Optional Hermes agent |
| `pnpm db:matomo:up` / `db:matomo:down` | Optional local Matomo for analytics testing |
| `pnpm db:down` | Stop Docker services |
| `pnpm db:reset` | Wipe `.data/postgres` and recreate DBs |
| `pnpm dev` | DB + storefront + medusa-backend |
| `pnpm build` | Build all apps |
| `pnpm verify:docker:medusa-packaging` | Pre-push guard: Medusa Dockerfile packages workspace deps (static; skip with `SKIP_DOCKER_PACKAGING_VERIFY=1`) |


Agent guide (including how to add analytics events for new features): [AGENTS.md](AGENTS.md)
