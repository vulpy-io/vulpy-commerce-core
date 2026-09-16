import { sql } from "@payloadcms/db-postgres";

/** @param {import('@payloadcms/db-postgres').MigrateUpArgs} args */
export async function up({ db }) {
  await db.execute(sql`
    ALTER TABLE "navigation_items_submenu"
      ADD COLUMN IF NOT EXISTS "mobile_only" boolean DEFAULT false;
  `);
}

/** @param {import('@payloadcms/db-postgres').MigrateDownArgs} args */
export async function down({ db }) {
  await db.execute(sql`
    ALTER TABLE "navigation_items_submenu" DROP COLUMN IF EXISTS "mobile_only";
  `);
}
