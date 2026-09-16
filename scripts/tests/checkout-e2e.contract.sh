#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

fail() {
  printf 'checkout-e2e contract: %s\n' "$1" >&2
  exit 1
}

node - <<'NODE'
const pkg = require("./package.json");
const required = [
  "test:e2e:checkout",
  "test:e2e:checkout:smoke",
  "test:e2e:checkout:structural",
  "test:e2e:checkout:stripe",
];
for (const name of required) {
  if (!pkg.scripts?.[name]) {
    throw new Error(`missing package script ${name}`);
  }
}
if (pkg.devDependencies?.["@playwright/test"] !== "1.55.0") {
  throw new Error("@playwright/test must be pinned to 1.55.0");
}
NODE

for path in \
  playwright.config.ts \
  scripts/tests/checkout-e2e.sh \
  apps/medusa-backend/src/scripts/seed-checkout-e2e.ts \
  e2e/checkout/fixtures.ts \
  e2e/checkout/keyboard.spec.ts \
  e2e/checkout/smoke.spec.ts \
  e2e/checkout/structural.spec.ts \
  e2e/checkout/stripe.spec.ts; do
  [ -f "${path}" ] || fail "missing ${path}"
done

grep -q 'seed-checkout-e2e' scripts/tests/checkout-e2e.sh || fail "dedicated checkout fixture is not run"
grep -q 'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-medusa}' docker-compose.yml || fail "disposable database credential is not propagated to Compose"
grep -qE 'postgres://medusa:\S+@' scripts/tests/checkout-e2e.sh || fail "database URLs do not use the disposable credential"
grep -q 'CHECKOUT_E2E_PRODUCT_HANDLE' e2e/checkout/fixtures.ts || fail "fixture does not target the dedicated product"
grep -q 'storageState: { cookies: \[\], origins: \[\] }' e2e/checkout/fixtures.ts || fail "each test does not start with isolated browser storage"
grep -q '@keyboard @stripe' e2e/checkout/keyboard.spec.ts || fail "keyboard Stripe iframe contract is missing"
grep -q 'toBeFocused' e2e/checkout/keyboard.spec.ts || fail "keyboard focus assertions are missing"
grep -q 'toBeChecked' e2e/checkout/keyboard.spec.ts || fail "keyboard radio/checkbox assertions are missing"
if grep -R -q 'taskOneRed\|@red' e2e/checkout; then
  fail "deliberate RED placeholders remain in the checkout suite"
fi
grep -q 'trace: "off"' playwright.config.ts || fail "Playwright traces can retain checkout secrets"
grep -q 'screenshot: "off"' playwright.config.ts || fail "Playwright screenshots can retain checkout data"
grep -q 'video: "off"' playwright.config.ts || fail "Playwright video can retain checkout data"

run_preflight() {
  env -u NEXT_PUBLIC_STRIPE_KEY -u STRIPE_API_KEY CHECKOUT_E2E_IGNORE_DOTENV=1 \
    bash scripts/tests/checkout-e2e.sh --preflight-only "$@" 2>&1
}

structural_output="$(run_preflight --grep @structural)" || fail "structural preflight requires Stripe credentials"
[ "${structural_output}" = "checkout-e2e preflight: PASS (structural)" ] || fail "unexpected structural preflight output"
default_output="$(run_preflight)" || fail "default preflight requires Stripe credentials"
[ "${default_output}" = "checkout-e2e preflight: PASS (structural)" ] || fail "default selector did not exclude Stripe"
invert_output="$(run_preflight --grep-invert @stripe)" || fail "grep-invert preflight requires Stripe credentials"
[ "${invert_output}" = "checkout-e2e preflight: PASS (structural)" ] || fail "grep-invert selector was parsed as Stripe"

set +e
missing_output="$(run_preflight --grep @stripe)"
missing_status=$?
set -e
[ "${missing_status}" -eq 78 ] || fail "missing Stripe credentials must fail with exit 78"
printf '%s' "${missing_output}" | grep -q 'required' || fail "missing Stripe preflight is not actionable"

matched_output="$(NEXT_PUBLIC_STRIPE_KEY=pk_test_contract STRIPE_API_KEY=sk_test_contract \
  bash scripts/tests/checkout-e2e.sh --preflight-only --grep @stripe 2>&1)" || fail "matching test Stripe modes must pass"
[ "${matched_output}" = "checkout-e2e preflight: PASS (stripe-test)" ] || fail "unexpected matched Stripe preflight output"

set +e
mismatch_output="$(NEXT_PUBLIC_STRIPE_KEY=pk_test_do_not_log STRIPE_API_KEY=sk_live_do_not_log \
  bash scripts/tests/checkout-e2e.sh --preflight-only --grep @stripe 2>&1)"
mismatch_status=$?
set -e
[ "${mismatch_status}" -eq 78 ] || fail "mismatched Stripe modes must fail with exit 78"
if printf '%s' "${mismatch_output}" | grep -q 'do_not_log'; then
  fail "Stripe preflight leaked credential values"
fi

set +e
live_output="$(NEXT_PUBLIC_STRIPE_KEY=pk_live_do_not_log STRIPE_API_KEY=sk_live_do_not_log \
  bash scripts/tests/checkout-e2e.sh --preflight-only --grep @stripe 2>&1)"
live_status=$?
set -e
[ "${live_status}" -eq 78 ] || fail "live Stripe keys must fail with exit 78"
if printf '%s' "${live_output}" | grep -q 'do_not_log'; then
  fail "live-key rejection leaked credential values"
fi

grep -q 'checkout-e2e-structural' .github/workflows/ci.yml || fail "focused structural CI job is missing"
grep -q 'playwright install chromium --with-deps' .github/workflows/ci.yml || fail "CI does not pin Chromium Linux dependencies"
grep -q 'COMPOSE_PROJECT_NAME="${PROJECT_NAME}"' scripts/tests/checkout-e2e.sh || fail "Compose project isolation is missing"
grep -q -- '--project-name "${PROJECT_NAME}"' scripts/tests/checkout-e2e.sh || fail "Compose commands are not project-isolated"
grep -q 'app_attempt <= 3' scripts/tests/checkout-e2e.sh || fail "app port binding is not retried"
if grep -q '$(seq ' scripts/tests/checkout-e2e.sh; then
  fail "non-portable seq loop remains"
fi

grep -q '^playwright-report/$' .gitignore || fail "playwright-report/ is not ignored"
grep -q '^test-results/$' .gitignore || fail "test-results/ is not ignored"

printf 'checkout-e2e contract: PASS\n'
