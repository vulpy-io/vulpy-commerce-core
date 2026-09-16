# Local validation guide

This guide validates the two stacked development branches before merge:

1. `agent/environment-kernel` — PR #2
2. `agent/hermes-foundation` — PR #3, stacked on PR #2

Run the tests in a disposable Git worktree. Do not use production credentials, domains, databases, or media.

## Validation rules

- Do not modify `main`.
- Do not merge or push fixes while validating.
- Do not use real production configuration or customer data.
- Treat generated `.env` files, test data, backups, and temporary Hermes skills as disposable.
- Capture exact failing commands and relevant logs.
- Do not mark a runtime check as passed based only on static inspection.
- Clean up containers and temporary data when finished.
- Report failures before changing the PR branches.

---

## 1. Prepare an isolated checkout

From the existing repository:

```bash
git fetch origin --prune

git worktree add --detach \
  ../vulpy-commerce-validation \
  origin/agent/environment-kernel

cd ../vulpy-commerce-validation

git status --short
git rev-list --count origin/main..origin/agent/environment-kernel
git rev-list --count origin/agent/environment-kernel..origin/agent/hermes-foundation
```

Expected:

```text
Working tree is clean
Environment branch count: 1
Hermes branch count: 1
```

Install dependencies and record tool versions:

```bash
corepack enable
pnpm install --frozen-lockfile

node --version
pnpm --version
docker --version
docker compose version
```

---

## 2. Validate PR #2: environment kernel

Switch to the environment branch:

```bash
git checkout --detach origin/agent/environment-kernel
```

### 2.1 Create disposable environment configuration

```bash
cp environments/dev/.env.example environments/dev/.env
cp environments/staging/.env.example environments/staging/.env
cp environments/live/.env.example environments/live/.env
```

Keep dev on its default local ports.

Configure staging with local-only values and unique ports:

```env
VULPY_ENV=staging
COMPOSE_PROJECT_NAME=vulpy-commerce-test-staging
DATA_DIR=.data/staging

HTTP_PORT=18080
HTTPS_PORT=18443

SHOP_DOMAIN=staging.localhost
API_DOMAIN=api.staging.localhost

NEXT_PUBLIC_SERVER_URL=https://staging.localhost:18443
NEXT_PUBLIC_MEDUSA_ASSET_URL=https://api.staging.localhost:18443
MEDUSA_BACKEND_URL=https://api.staging.localhost:18443
VITE_MEDUSA_BACKEND_URL=https://api.staging.localhost:18443
STOREFRONT_URL=https://staging.localhost:18443
STORE_CORS=https://staging.localhost:18443
ADMIN_CORS=https://api.staging.localhost:18443
AUTH_CORS=https://api.staging.localhost:18443
PAYLOAD_URL=https://staging.localhost:18443
```

Configure live with different local-only ports and domains:

```env
VULPY_ENV=live
COMPOSE_PROJECT_NAME=vulpy-commerce-test-live
DATA_DIR=.data/live

HTTP_PORT=28080
HTTPS_PORT=28443

SHOP_DOMAIN=live.localhost
API_DOMAIN=api.live.localhost

NEXT_PUBLIC_SERVER_URL=https://live.localhost:28443
NEXT_PUBLIC_MEDUSA_ASSET_URL=https://api.live.localhost:28443
MEDUSA_BACKEND_URL=https://api.live.localhost:28443
VITE_MEDUSA_BACKEND_URL=https://api.live.localhost:28443
STOREFRONT_URL=https://live.localhost:28443
STORE_CORS=https://live.localhost:28443
ADMIN_CORS=https://api.live.localhost:28443
AUTH_CORS=https://api.live.localhost:28443
PAYLOAD_URL=https://live.localhost:28443
```

Replace all `change-me` placeholders with strong disposable values. Do not commit the generated files.

### 2.2 Static and Compose checks

```bash
bash -n scripts/vulpy.sh
bash -n scripts/environment-backup.sh
bash -n scripts/environment-restore.sh
bash -n scripts/generate-agent-context.sh
bash -n scripts/lib/project-env.sh
bash -n scripts/deploy/prod-compose.sh

pnpm vulpy env list
pnpm vulpy env doctor dev
pnpm vulpy env doctor staging
pnpm vulpy env doctor live
pnpm vulpy agent context
```

Inspect `.agent/generated-context.md`.

Pass criteria:

- dev, staging, and live are listed;
- no secret values appear in generated context;
- every environment has a distinct Compose project;
- every environment has a distinct data directory;
- staging and live use different HTTP and HTTPS ports;
- all three Compose configurations validate.

Check the worktree:

```bash
git status --short
```

Only ignored local configuration and generated files should exist.

### 2.3 Start environments and verify isolation

Start dev in the background:

```bash
mkdir -p .tmp
nohup pnpm vulpy env up dev > .tmp/validation-dev.log 2>&1 &
echo $! > .tmp/validation-dev.pid
```

Wait for services, then inspect dev:

```bash
pnpm vulpy env status dev
```

Start staging:

```bash
pnpm vulpy env up staging
pnpm vulpy env status staging
```

Inspect containers and ports:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | sort
```

Pass criteria:

- dev and staging run simultaneously;
- container names use different Compose project prefixes;
- PostgreSQL storage paths differ;
- Redis paths differ;
- media paths differ;
- no port collision occurs;
- stopping one environment does not stop the other.

Test the last condition:

```bash
pnpm vulpy env down dev
pnpm vulpy env status staging
```

Staging must remain running.

### 2.4 Verify database isolation

Start dev again if necessary. Insert different marker values into each Medusa database.

Staging:

```bash
VULPY_ENV=staging \
VULPY_ENV_FILE="$PWD/environments/staging/.env" \
bash scripts/deploy/prod-compose.sh exec -T postgres \
psql -U medusa -d medusa -v ON_ERROR_STOP=1 -c \
"CREATE TABLE IF NOT EXISTS vulpy_validation (id integer PRIMARY KEY, value text);
 INSERT INTO vulpy_validation (id, value)
 VALUES (1, 'staging')
 ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;"
```

Dev:

```bash
VULPY_ENV=dev \
VULPY_ENV_FILE="$PWD/environments/dev/.env" \
bash scripts/compose.sh exec -T postgres \
psql -U medusa -d medusa -v ON_ERROR_STOP=1 -c \
"CREATE TABLE IF NOT EXISTS vulpy_validation (id integer PRIMARY KEY, value text);
 INSERT INTO vulpy_validation (id, value)
 VALUES (1, 'dev')
 ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;"
```

Read both values back.

Pass criteria:

```text
dev database value: dev
staging database value: staging
```

### 2.5 Validate backup and restore

Use staging only.

Create a persistent-file marker:

```bash
mkdir -p .data/staging/payload-media
printf 'before-backup\n' > .data/staging/payload-media/vulpy-validation.txt
```

Set the staging database marker to `before-backup`, then create a backup:

```bash
VULPY_ENV=staging \
VULPY_ENV_FILE="$PWD/environments/staging/.env" \
pnpm vulpy env backup staging .tmp/staging-validation.tar.gz
```

Inspect the archive:

```bash
tar -tzf .tmp/staging-validation.tar.gz | sort
```

It should contain:

- `manifest.txt`;
- `checksums.sha256`;
- the Medusa database dump;
- the Payload dump when that database exists;
- environment and Compose configuration;
- the persistent-file archive.

Mutate the database and file after backup:

```bash
VULPY_ENV=staging \
VULPY_ENV_FILE="$PWD/environments/staging/.env" \
bash scripts/deploy/prod-compose.sh exec -T postgres \
psql -U medusa -d medusa -c \
"UPDATE vulpy_validation SET value = 'after-backup' WHERE id = 1;"

printf 'after-backup\n' > .data/staging/payload-media/vulpy-validation.txt
```

Restore:

```bash
VULPY_RESTORE_CONFIRM=staging \
VULPY_ENV=staging \
VULPY_ENV_FILE="$PWD/environments/staging/.env" \
pnpm vulpy env restore staging .tmp/staging-validation.tar.gz
```

Pass criteria:

- checksum validation succeeds;
- a pre-restore backup is created;
- the database marker returns to `before-backup`;
- the media file returns to `before-backup`;
- services start successfully after restore;
- no dev or live data is changed.

Verify restore refuses to run without confirmation:

```bash
pnpm vulpy env restore staging .tmp/staging-validation.tar.gz
```

The command must exit without modifying data.

### 2.6 Compatibility checks

Verify existing commands still resolve:

```bash
pnpm dev --help || true
pnpm db:up
pnpm db:down
```

Validate the legacy production configuration statically:

```bash
docker compose \
  --env-file deploy/.env.prod.example \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  config --quiet
```

Report any incompatibility with the root `.env` or legacy `deploy/.env` workflow.

---

## 3. Validate PR #3: Hermes foundation

Stop PR #2 containers:

```bash
pnpm vulpy env down dev || true
pnpm vulpy env down staging || true
pnpm vulpy env down live || true
```

Switch to the stacked Hermes branch:

```bash
git checkout --detach origin/agent/hermes-foundation
```

Confirm it is a single commit over the environment branch:

```bash
git rev-list --count origin/agent/environment-kernel..HEAD
```

Expected:

```text
1
```

### 3.1 Inspect the skill structure

Verify these Hermes-native project skills exist directly in `.hermes/skills`:

```text
vulpy-commerce-operator
vulpy-content-operations
vulpy-environment-operations
vulpy-medusa-development
vulpy-storefront-development
```

Verify the generic coding-agent skill exists:

```text
.agents/skills/vulpy-commerce/SKILL.md
```

Check that no startup sync script is referenced:

```bash
grep -R "hermes-sync-skills" \
  docker-compose*.yml package.json scripts .hermes .agents \
  --exclude-dir=node_modules || true
```

Expected: no active reference.

### 3.2 Start Hermes

The disposable dev environment file should still be present.

```bash
pnpm db:hermes:up
```

Inspect status and logs:

```bash
VULPY_ENV=dev \
VULPY_ENV_FILE="$PWD/environments/dev/.env" \
bash scripts/compose.sh --profile hermes ps

VULPY_ENV=dev \
VULPY_ENV_FILE="$PWD/environments/dev/.env" \
bash scripts/compose.sh --profile hermes logs --tail=200 hermes
```

Pass criteria:

- Hermes starts without the deleted sync script;
- no missing-skill startup error appears;
- `.hermes/skills` is writable inside the container;
- the new Vulpy skills are visible.

List skills in the container:

```bash
VULPY_ENV=dev \
VULPY_ENV_FILE="$PWD/environments/dev/.env" \
bash scripts/compose.sh --profile hermes exec -T hermes \
sh -lc 'find /data/data/hermes/skills -name SKILL.md | sort'
```

### 3.3 Verify skill persistence

Create a disposable test skill inside Hermes:

```bash
VULPY_ENV=dev \
VULPY_ENV_FILE="$PWD/environments/dev/.env" \
bash scripts/compose.sh --profile hermes exec -T hermes sh -lc '
mkdir -p /data/data/hermes/skills/vulpy-validation-skill
cat > /data/data/hermes/skills/vulpy-validation-skill/SKILL.md <<EOF
---
name: vulpy-validation-skill
description: Temporary persistence validation skill.
---

# Validation

Temporary test skill.
EOF
'
```

Restart Hermes:

```bash
VULPY_ENV=dev \
VULPY_ENV_FILE="$PWD/environments/dev/.env" \
bash scripts/compose.sh --profile hermes restart hermes
```

Verify the skill still exists, then delete it:

```bash
rm -rf .hermes/skills/vulpy-validation-skill
```

Pass criteria:

- Hermes can write into `.hermes/skills`;
- the created skill survives restart;
- no startup process deletes it;
- cleanup leaves no untracked test skill.

### 3.4 Skill-quality smoke tests

Read the five Vulpy Hermes skills and the generic agent skill. Confirm they correctly describe:

- Medusa ownership of commerce data;
- Payload ownership of editorial content;
- storefront ownership of UI and behavior;
- dev as the default target;
- explicit confirmation before live changes;
- environment-aware backup and restore;
- concrete repository paths;
- relevant validation commands;
- no startup syncing or allowlist layer.

When model credentials are available, run these prompts through Hermes:

```text
Where should I change the homepage hero copy, and in which environment should you do it?
```

Expected: Payload, dev by default, and verification of the rendered result.

```text
Add an announcement bar above the storefront header.
```

Expected: storefront code, dev environment, existing project patterns, validation commands, and no live change.

```text
Add a Medusa backend endpoint related to products.
```

Expected: `apps/medusa-backend`, existing route conventions, relevant tests and type checking.

Do not allow these smoke prompts to modify live. If model credentials are unavailable, report runtime prompt testing as blocked rather than passed.

---

## 4. General project checks

Run on both branches where practical:

```bash
pnpm check
pnpm typecheck
pnpm test
```

Validate Compose configuration for all environments.

Inspect the branch diff for accidentally committed secrets:

```bash
git diff origin/main...HEAD -- ':!pnpm-lock.yaml' | \
grep -Ei 'api[_-]?key|secret|password|token|private[_-]?key' || true
```

Manually distinguish placeholders and documentation from actual credentials.

---

## 5. Cleanup

Stop all environments and services:

```bash
pnpm vulpy env down dev || true
pnpm vulpy env down staging || true
pnpm vulpy env down live || true
pnpm db:down || true
```

Remove disposable files:

```bash
rm -f environments/dev/.env
rm -f environments/staging/.env
rm -f environments/live/.env
rm -rf .data/dev .data/staging .data/live
rm -rf .tmp/backups .tmp/staging-validation.tar.gz
rm -f .agent/generated-context.md
rm -rf .hermes/skills/vulpy-validation-skill
```

Check the worktree:

```bash
git status --short
```

It must be clean.

Remove the disposable worktree after leaving its directory:

```bash
cd ../vulpy-commerce-pro
git worktree remove ../vulpy-commerce-validation
```

---

## 6. Required final report

Return the results in this structure:

```text
Overall result: PASS / PASS WITH ISSUES / FAIL

PR #2 — Environment kernel
- Static validation:
- Dev startup:
- Staging startup:
- Concurrent isolation:
- Database isolation:
- Backup:
- Restore:
- Legacy compatibility:
- Failures:

PR #3 — Hermes foundation
- Hermes startup:
- Vulpy skill discovery:
- Useful stock skills retained:
- Removed skills absent:
- Writable skill persistence:
- Prompt smoke tests:
- Failures:

Commands that failed
1.
2.

Likely root causes
1.
2.

Recommended fixes
1.
2.

Unverified items
1.
2.
```

Include relevant log excerpts, but never include credentials or complete environment files.

The most important evidence is:

1. dev and staging can run concurrently without sharing data;
2. backup and restore complete a real round trip;
3. Hermes starts with the curated repository skills;
4. a skill created by Hermes persists after restart.
