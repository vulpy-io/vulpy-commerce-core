/** Marker migration — flexible block-based pages (schema applied via dev push). */
/** @param {import('@payloadcms/db-postgres').MigrateUpArgs} _args */
export async function up(_args) {
  // No-op: schema was applied via dev push before migration-only prod workflow.
}

/** @param {import('@payloadcms/db-postgres').MigrateDownArgs} _args */
export async function down(_args) {
  // No rollback for marker migration.
}
