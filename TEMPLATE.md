# Creating a new shop from this template

## 1. Copy the template

Prefer `rsync` over `cp -a` so you can exclude heavy or machine-specific dirs. **Do not copy `node_modules`** — reinstall on the target with `pnpm install`.

```bash
SRC=/path/to/vulpy-commerce-template
DEST=/path/to/my-shop
mkdir -p "$DEST"
rsync -aH \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.medusa' \
  --exclude='.turbo' \
  --exclude='.tmp/migrate-bundle-*' \
  "$SRC/" "$DEST/"
cd "$DEST"
pnpm install
```

Include `.git/` to keep full history, or exclude it and run `git init` for a clean repo.

**Rebrand** before starting Docker on a host that already runs another copy of this template:

- `COMPOSE_PROJECT_NAME` in `.env` and `deploy/.env` (defaults to folder name when empty)
- `package.json` `"name"` (optional)
- Domains and secrets in `deploy/.env`
- `git remote set-url` when publishing to a new remote

Copy local env files when present: `.env`, `apps/medusa-backend/.env`, `apps/storefront/.env`, `deploy/.env`.

On **NTFS/exFAT** hosts, Postgres dev data lives under `~/.local/share/<COMPOSE_PROJECT_NAME>/postgres` — it is not in the repo and is not copied by rsync.

### Data: seed vs migrate

- **Seed only (typical new shop):** `pnpm bootstrap` locally, or `SEED_ON_START=1` on first prod deploy. Payload CMS seed is separate (`pnpm --filter @apps/storefront seed` locally; see `deploy/README.md` for prod).
- **Migrate existing dev DB/media:** `./scripts/migrate/export-local.sh` → import on VPS (`SEED_ON_START=0` in `deploy/.env`).

```bash
cd /opt/my-shop   # or your DEST path
pnpm bootstrap
```

`COMPOSE_PROJECT_NAME` defaults to the folder name (`my-shop`). Set it explicitly in `.env` if needed.

## 2. Local development

```bash
pnpm bootstrap    # install, DB, migrate, seed, admin, publishable key
pnpm dev
pnpm --filter @apps/storefront seed   # Payload CMS (while dev is running)
```

## 3. VPS install (dev first) then go live

Install is **dev-only**: Hermes + a private development shop. Nothing goes public until you add live later.

```bash
# Preferred empty-VPS one-liner (private repo): see AGENTS.md / vulpy-remote-install.sh
cd ~/vulpy-commerce   # cloud sudo user (ubuntu), not /opt
sudo bash scripts/vulpy-bootstrap-host.sh
# Follow the prompts (Enter accepts defaults). Finish screen prints HTTPS URLs.
```

This installs Docker/Node/pnpm if needed, owns the shop as `$SUDO_USER`, starts Hermes + the development shop, and restores checkout ownership without walking `node_modules`.

When the shop is ready for customers (human CLI only — not the AI agent):

```bash
pnpm vulpy env add live          # domains, build, start live stack
pnpm vulpy env golive live       # preview host → 301 to apex
```

See `deploy/README.md` and `.hermes/ARCHITECTURE.md`.

After first rollout, complete legal/privacy gates:

```bash
LEGAL_REVIEWER='Counsel <you@firm>' ./scripts/deploy/ack-legal-review.sh
# Replace placeholder /privacy-policy and /cookie-policy CMS copy
./scripts/deploy/verify-matomo-privacy.sh
```

See `deploy/README.md` and `AGENTS.md` for Hermes access modes and Matomo.

### Migrating existing dev data

```bash
./scripts/migrate/export-local.sh
scp .tmp/migrate-bundle-*.tar.gz user@vps:/opt/my-shop/
COMPOSE_SUDO=1 ./scripts/deploy/rollout-vps.sh migrate-bundle-YYYYMMDD.tar.gz
```

Set `SEED_ON_START=0` in `deploy/.env` when restoring a bundle.

### Image transfer (build locally, deploy to small VPS)

```bash
./scripts/deploy/build-prod.sh
./scripts/deploy/save-prod-images.sh    # → .tmp/<project>-images.tar.gz
scp .tmp/my-shop-images.tar.gz user@vps:/opt/my-shop/
COMPOSE_SUDO=1 ./scripts/deploy/load-prod-images.sh my-shop-images.tar.gz
```

## 4. Multiple projects on one VPS

- Each shop gets its own folder: `/opt/shop-a/`, `/opt/shop-b/`.
- Set a unique `COMPOSE_PROJECT_NAME` per folder (default: folder name).
- Each project has its own `.data/` — backup/restore is `tar` the folder.
- **Caddy binds ports 80/443** — only one prod stack with embedded Caddy can run per VPS until you add a shared reverse proxy (planned next step).

## 5. CI / GHCR (optional)

This template does not ship a demo workflow. For each shop repo:

1. Copy `.github/workflows/deploy.yml.example` (create when adding CI) or write your own.
2. Set image names: `ghcr.io/<org>/<project>-medusa`, `ghcr.io/<org>/<project>-storefront`.
3. Set `MEDUSA_IMAGE` / `STOREFRONT_IMAGE` in `deploy/.env` when pulling pre-built images.

## Customization checklist

- [ ] `COMPOSE_PROJECT_NAME` in `.env`
- [ ] Domains + secrets in `deploy/.env` (including `MATOMO_DOMAIN` / Matomo DB+admin secrets)
- [ ] Branding in Payload (`pnpm --filter @apps/storefront seed`)
- [ ] Logo/assets in storefront
- [ ] Payment providers (Stripe, etc.)
- [ ] **Matomo:** `setup-matomo.sh` (or rollout), legal ack, privacy/cookie copy without placeholders — see `AGENTS.md` / `deploy/README.md`
- [ ] **B2B price gating** (optional): `REQUIRE_LOGIN_FOR_PRICES=true` in root `.env` / `deploy/.env` + customer accounts enabled — see `AGENTS.md` §7
- [ ] GHCR workflow + VPS secrets (if using CI)
