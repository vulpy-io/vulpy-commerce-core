/**
 * Prod-safe Payload admin upsert (no /api/dev/seed).
 * Reads PAYLOAD_SEED_EMAIL / PAYLOAD_SEED_PASSWORD (or ADMIN_*).
 *
 * Usage:
 *   pnpm --filter @apps/storefront exec tsx src/scripts/ensure-admin.ts
 */
import { config as loadDotEnv } from "dotenv";
import {
  assertAdminCredentials,
  resolveAdminCredentials,
  upsertPayloadAdmin,
} from "./ensure-admin-core";

async function main() {
  loadDotEnv({ path: ".env" });
  const { email, password } = resolveAdminCredentials();
  assertAdminCredentials(email, password);

  // Load Payload only after the app env is present. Native ESM does not run
  // Payload CLI's CommonJS env loader, and importing config first leaves the
  // Postgres connection without its password.
  const [{ default: config }, { getPayload }] = await Promise.all([
    import("../../payload.config"),
    import("payload"),
  ]);
  const payload = await getPayload({ config });
  const outcome = await upsertPayloadAdmin(payload, email, password);
  if (outcome === "updated") {
    console.log(`[payload-admin] Updated password for ${email}`);
  } else {
    console.log(`[payload-admin] Created admin ${email}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
