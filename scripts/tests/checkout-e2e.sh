#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ARGS=("$@")
if [ "${#ARGS[@]}" -eq 0 ]; then
  ARGS=(--grep-invert @stripe)
fi

PREFLIGHT_ONLY=0
STRIPE_RUN=0
for ((arg_index = 0; arg_index < ${#ARGS[@]}; arg_index++)); do
  if [ "${ARGS[${arg_index}]}" = "--preflight-only" ]; then
    PREFLIGHT_ONLY=1
    unset 'ARGS[arg_index]'
    continue
  fi
  if [ "${ARGS[${arg_index}]}" = "--grep" ] &&
    [ "${ARGS[$((arg_index + 1))]:-}" = "@stripe" ]; then
    STRIPE_RUN=1
  fi
done
ARGS=("${ARGS[@]}")

read_dotenv_value() {
  local key="$1"
  shift
  node - "${key}" "$@" <<'NODE'
const fs = require("node:fs");
const [key, ...files] = process.argv.slice(2);
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  if (line) {
    const value = line.slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    process.stdout.write(value);
    process.exit(0);
  }
}
NODE
}

if [ "${STRIPE_RUN}" -eq 1 ]; then
  if [ "${CHECKOUT_E2E_IGNORE_DOTENV:-0}" != "1" ]; then
    NEXT_PUBLIC_STRIPE_KEY="${NEXT_PUBLIC_STRIPE_KEY:-$(read_dotenv_value NEXT_PUBLIC_STRIPE_KEY apps/storefront/.env .env)}"
    STRIPE_API_KEY="${STRIPE_API_KEY:-$(read_dotenv_value STRIPE_API_KEY apps/medusa-backend/.env .env)}"
  fi
  if [ -z "${NEXT_PUBLIC_STRIPE_KEY:-}" ] || [ -z "${STRIPE_API_KEY:-}" ]; then
    echo "checkout-e2e Stripe preflight: test publishable and secret keys are required; values are never logged." >&2
    exit 78
  fi
  case "${NEXT_PUBLIC_STRIPE_KEY}:${STRIPE_API_KEY}" in
    pk_test_*:sk_test_*) STRIPE_MODE="stripe-test" ;;
    pk_live_*:sk_live_*)
      echo "checkout-e2e Stripe preflight: live keys are refused; use a test-mode key pair." >&2
      exit 78
      ;;
    *)
      echo "checkout-e2e Stripe preflight: publishable and secret key modes do not match." >&2
      exit 78
      ;;
  esac
  export NEXT_PUBLIC_STRIPE_KEY STRIPE_API_KEY
else
  STRIPE_MODE="structural"
fi

if [ "${PREFLIGHT_ONLY}" -eq 1 ]; then
  printf 'checkout-e2e preflight: PASS (%s)\n' "${STRIPE_MODE}"
  exit 0
fi

if [ "$(uname -s)" != "Linux" ]; then
  echo "checkout-e2e preflight: this harness requires Linux; CI runs it on Ubuntu." >&2
  exit 69
fi
for required_command in node corepack curl sed setsid tail tee; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "checkout-e2e preflight: required command is missing: ${required_command}" >&2
    exit 69
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "checkout-e2e preflight: Docker CLI is required for the isolated real stack." >&2
  echo "Run this command on a host with Docker: corepack pnpm test:e2e:checkout:smoke" >&2
  exit 69
fi
if ! docker info >/dev/null 2>&1; then
  echo "checkout-e2e preflight: Docker daemon is unavailable." >&2
  echo "Start Docker, then run: corepack pnpm test:e2e:checkout:smoke" >&2
  exit 69
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN_DIR="${ROOT_DIR}/.tmp/checkout-e2e/${RUN_ID}"
PROJECT_NAME="vulpy-checkout-e2e-${RUN_ID,,}"
ENV_FILE="${RUN_DIR}/compose.env"
STOREFRONT_ENV_FILE="${RUN_DIR}/storefront.env"
mkdir -p "${RUN_DIR}"
chmod 700 "${RUN_DIR}"

allocate_app_ports() {
  # Allocate two ephemeral OS ports by letting the kernel bind to :0.
  # TOCTOU race: there is a brief window between closing these server sockets
  # and passing the port numbers to the app processes where another process
  # could claim the port. The 3-retry loop below is the accepted mitigation:
  # on collision the app fails to bind, we re-allocate, and try again.
  node - <<'NODE'
const net = require("node:net");
const servers = [];
const ports = [];
function allocate() {
  if (ports.length === 2) {
    console.log(ports.join("\n"));
    for (const server of servers) server.close();
    return;
  }
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    servers.push(server);
    ports.push(server.address().port);
    allocate();
  });
}
allocate();
NODE
}
mapfile -t APP_PORTS < <(allocate_app_ports)
POSTGRES_PORT=0
REDIS_PORT=0
MEDUSA_PORT="${APP_PORTS[0]}"
STOREFRONT_PORT="${APP_PORTS[1]}"

export COMPOSE_PROJECT_NAME="${PROJECT_NAME}"
export DATA_DIR="${RUN_DIR}/data"
export POSTGRES_DATA_DIR="${DATA_DIR}/postgres"
export REDIS_DATA_DIR="${DATA_DIR}/redis"
export POSTGRES_PORT REDIS_PORT
export POSTGRES_PASSWORD="checkout-e2e-disposable"
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
export MEDUSA_BACKEND_URL="http://127.0.0.1:${MEDUSA_PORT}"
export NEXT_PUBLIC_MEDUSA_BACKEND_URL="${MEDUSA_BACKEND_URL}"
export STORE_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
export ADMIN_CORS="${MEDUSA_BACKEND_URL}"
export AUTH_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
export CMS_ALLOW_DEFAULTS=1
export PAYLOAD_SECRET="checkout-e2e-disposable-not-a-production-secret"
# Enable customer account UI so the create-account checkbox test always runs.
export NEXT_PUBLIC_ENABLE_CUSTOMER_ACCOUNTS=true
export VULPY_ENV_FILE="${ENV_FILE}"
export CHECKOUT_E2E_BASE_URL="http://127.0.0.1:${STOREFRONT_PORT}"
export PLAYWRIGHT_HTML_OPEN=never

cat >"${ENV_FILE}" <<EOF
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
DATA_DIR=${DATA_DIR}
POSTGRES_DATA_DIR=${POSTGRES_DATA_DIR}
REDIS_DATA_DIR=${REDIS_DATA_DIR}
POSTGRES_PORT=${POSTGRES_PORT}
REDIS_PORT=${REDIS_PORT}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EOF
chmod 600 "${ENV_FILE}"

MEDUSA_PID=""
STOREFRONT_PID=""

redact_log() {
  sed -E \
    -e 's#(https?://[^?[:space:]]+)\?[^[:space:]]+#\1?[REDACTED_QUERY]#g' \
    -e 's#(postgres(ql)?://[^:[:space:]]+:)[^@[:space:]]+@#\1[REDACTED]@#g' \
    -e 's/(client_secret|STRIPE_API_KEY|NEXT_PUBLIC_STRIPE_KEY|MEDUSA_PUBLISHABLE_KEY|authorization|cookie|set-cookie)[" ]*[=:][" ]*[^",[:space:]]+/\1=[REDACTED]/Ig' \
    -e 's/(Bearer )[[:alnum:]_.~+\/-]+/\1[REDACTED]/Ig' \
    -e 's/(sk|pk)_(test|live)_[[:alnum:]_]+/[REDACTED_KEY]/g' \
    -e 's/(card(number)?|cvc)[" ]*[=:][" ]*[^",[:space:]]+/\1=[REDACTED]/Ig' \
    -e 's/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}/[REDACTED_EMAIL]/g'
}

cleanup() {
  local status=$?
  set +e
  if [ -n "${STOREFRONT_PID}" ]; then kill -- "-${STOREFRONT_PID}" >/dev/null 2>&1; fi
  if [ -n "${MEDUSA_PID}" ]; then kill -- "-${MEDUSA_PID}" >/dev/null 2>&1; fi
  docker compose --env-file "${ENV_FILE}" --project-name "${PROJECT_NAME}" down --volumes --remove-orphans >/dev/null 2>&1
  rm -f "${STOREFRONT_ENV_FILE}"
  if [ "${status}" -ne 0 ]; then
    echo "checkout-e2e: failed (exit ${status}); sanitized server tails follow." >&2
    mkdir -p "${ROOT_DIR}/playwright-report/diagnostics"
    for log in medusa storefront; do
      if [ -f "${RUN_DIR}/${log}.log" ]; then
        echo "--- ${log} (sanitized) ---" >&2
        tail -n 30 "${RUN_DIR}/${log}.log" | redact_log \
          | tee "${ROOT_DIR}/playwright-report/diagnostics/${log}.sanitized.log" >&2
        chmod 600 "${ROOT_DIR}/playwright-report/diagnostics/${log}.sanitized.log"
      fi
    done
  fi
  rm -rf "${RUN_DIR}"
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts="$3"
  local pid="${4:-}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if [ -n "${pid}" ] && ! kill -0 "${pid}" >/dev/null 2>&1; then
      echo "checkout-e2e readiness: ${name} exited before becoming ready." >&2
      return 1
    fi
    if curl --fail --silent --show-error --max-time 3 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "checkout-e2e readiness: ${name} did not become ready at ${url} within ${attempts}s." >&2
  return 1
}

echo "checkout-e2e: starting disposable project ${PROJECT_NAME}"
docker compose --env-file "${ENV_FILE}" --project-name "${PROJECT_NAME}" up -d postgres redis
POSTGRES_PORT="$(docker compose --env-file "${ENV_FILE}" --project-name "${PROJECT_NAME}" port postgres 5432 | sed -E 's/.*:([0-9]+)$/\1/')"
REDIS_PORT="$(docker compose --env-file "${ENV_FILE}" --project-name "${PROJECT_NAME}" port redis 6379 | sed -E 's/.*:([0-9]+)$/\1/')"
export DATABASE_URL="postgres://medusa:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/medusa"
export PAYLOAD_DATABASE_URL="postgres://medusa:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/payload"
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
for ((readiness_attempt = 1; readiness_attempt <= 60; readiness_attempt++)); do
  if docker compose --env-file "${ENV_FILE}" --project-name "${PROJECT_NAME}" exec -T postgres pg_isready -U medusa -d medusa >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker compose --env-file "${ENV_FILE}" --project-name "${PROJECT_NAME}" exec -T postgres pg_isready -U medusa -d medusa >/dev/null 2>&1; then
  echo "checkout-e2e readiness: disposable PostgreSQL was not ready within 60s." >&2
  exit 70
fi

corepack pnpm --filter @vulpy/medusa-plugin-email build >/dev/null
corepack pnpm --filter @apps/medusa-backend exec medusa db:migrate >"${RUN_DIR}/migrate.log" 2>&1
corepack pnpm --filter @apps/medusa-backend seed >"${RUN_DIR}/seed.log" 2>&1
corepack pnpm --filter @apps/medusa-backend exec medusa exec ./src/scripts/seed-checkout-e2e.ts >"${RUN_DIR}/checkout-fixture.log" 2>&1
bash scripts/init-payload-db.sh >"${RUN_DIR}/payload-db.log" 2>&1
DEPLOY_ENV_FILE="${STOREFRONT_ENV_FILE}" \
  corepack pnpm --filter @apps/medusa-backend print-publishable-key \
  >/dev/null 2>&1
# Redirect >/dev/null 2>&1 suppresses both stdout (key token written to DEPLOY_ENV_FILE)
# and stderr (Medusa logger which can emit to stderr in some configurations).
# The key value is read from STOREFRONT_ENV_FILE below — never exposed in the log pipeline.
chmod 600 "${STOREFRONT_ENV_FILE}"
# shellcheck disable=SC1090
source "${STOREFRONT_ENV_FILE}"
export MEDUSA_PUBLISHABLE_KEY

apps_ready=0
for ((app_attempt = 1; app_attempt <= 3; app_attempt++)); do
  if [ "${app_attempt}" -gt 1 ]; then
    mapfile -t APP_PORTS < <(allocate_app_ports)
    MEDUSA_PORT="${APP_PORTS[0]}"
    STOREFRONT_PORT="${APP_PORTS[1]}"
    export MEDUSA_BACKEND_URL="http://127.0.0.1:${MEDUSA_PORT}"
    export NEXT_PUBLIC_MEDUSA_BACKEND_URL="${MEDUSA_BACKEND_URL}"
    export STORE_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
    export ADMIN_CORS="${MEDUSA_BACKEND_URL}"
    export AUTH_CORS="http://127.0.0.1:${STOREFRONT_PORT}"
    export CHECKOUT_E2E_BASE_URL="http://127.0.0.1:${STOREFRONT_PORT}"
  fi

  setsid env MEDUSA_PORT="${MEDUSA_PORT}" \
    corepack pnpm --filter @apps/medusa-backend dev >"${RUN_DIR}/medusa.log" 2>&1 &
  MEDUSA_PID=$!
  if ! wait_for_url "Medusa" "${MEDUSA_BACKEND_URL}/health" 180 "${MEDUSA_PID}"; then
    kill -- "-${MEDUSA_PID}" >/dev/null 2>&1 || true
    MEDUSA_PID=""
    continue
  fi

  setsid env PORT="${STOREFRONT_PORT}" \
    corepack pnpm --filter @apps/storefront dev >"${RUN_DIR}/storefront.log" 2>&1 &
  STOREFRONT_PID=$!
  if wait_for_url "storefront" "${CHECKOUT_E2E_BASE_URL}/shop" 180 "${STOREFRONT_PID}"; then
    apps_ready=1
    break
  fi
  kill -- "-${STOREFRONT_PID}" >/dev/null 2>&1 || true
  kill -- "-${MEDUSA_PID}" >/dev/null 2>&1 || true
  STOREFRONT_PID=""
  MEDUSA_PID=""
done
if [ "${apps_ready}" -ne 1 ]; then
  echo "checkout-e2e readiness: app ports could not be bound after 3 attempts." >&2
  exit 70
fi

if [ "${CHECKOUT_E2E_INSTALL_BROWSER:-1}" = "1" ]; then
  corepack pnpm exec playwright install chromium >/dev/null
fi
corepack pnpm exec playwright test e2e/checkout "${ARGS[@]}"
