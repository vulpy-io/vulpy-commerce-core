/**
 * Minimal Payload config for running SQL migrations only (no collections / lexical).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || "migrate-only",
  collections: [],
  globals: [],
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.DATABASE_URI ||
        process.env.PAYLOAD_DATABASE_URL ||
        "",
    },
    push: false,
    migrationDir: path.resolve(dirname, "src/migrations"),
  }),
});
