#!/usr/bin/env node
/**
 * Clear Payload's batch=-1 "dev push" marker, then run migrations non-interactively.
 * Without this, `payload migrate` prompts on TTY and may exit 0 without migrating
 * when stdin is not a TTY.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const storefrontRoot = join(here, "..");
const workspaceRoot = join(storefrontRoot, "../..");

const connectionString =
  process.env.PAYLOAD_DATABASE_URL || process.env.DATABASE_URI || "";

if (!connectionString) {
  console.error(
    "[payload-migrate] PAYLOAD_DATABASE_URL or DATABASE_URI is required"
  );
  process.exit(1);
}

function loadPgClient() {
  const attempts = [
    () => require("pg"),
    () => require(join(storefrontRoot, "node_modules/pg")),
    () => createRequire(join(storefrontRoot, "package.json"))("pg"),
    () => createRequire(join(workspaceRoot, "package.json"))("pg"),
    () => {
      const dbPostgresPkg = require.resolve(
        "@payloadcms/db-postgres/package.json",
        { paths: [storefrontRoot, workspaceRoot] }
      );
      return createRequire(dbPostgresPkg)("pg");
    },
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function clearDevPushMarker() {
  let Client;
  try {
    ({ Client } = loadPgClient());
  } catch (error) {
    console.warn(
      "[payload-migrate] pg not available; skipping batch=-1 clear",
      error
    );
    return;
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      "DELETE FROM payload_migrations WHERE batch = -1 RETURNING name"
    );
    if (result.rowCount > 0) {
      console.log(
        `[payload-migrate] Removed ${result.rowCount} dev-push marker(s):`,
        result.rows.map((row) => row.name).join(", ")
      );
    }
  } catch (error) {
    console.warn(
      "[payload-migrate] Could not clear batch=-1 markers (table missing?):",
      error instanceof Error ? error.message : error
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

await clearDevPushMarker();

const configPath =
  process.env.PAYLOAD_CONFIG_PATH || "payload.migrate.config.ts";
const env = { ...process.env, PAYLOAD_CONFIG_PATH: configPath };
const result = spawnSync("pnpm", ["exec", "payload", "migrate"], {
  cwd: storefrontRoot,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
