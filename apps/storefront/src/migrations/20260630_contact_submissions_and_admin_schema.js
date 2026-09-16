import { sql } from "@payloadcms/db-postgres";

/** @param {import('@payloadcms/db-postgres').MigrateUpArgs} args */
export async function up({ db }) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "contact_submissions" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "email" varchar NOT NULL,
      "subject" varchar,
      "message" varchar NOT NULL,
      "updated_at" timestamptz(3) DEFAULT now() NOT NULL,
      "created_at" timestamptz(3) DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "contact_submissions_created_at_idx"
      ON "contact_submissions" ("created_at");
    CREATE INDEX IF NOT EXISTS "contact_submissions_updated_at_idx"
      ON "contact_submissions" ("updated_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "contact_submissions_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_contact_submissions_fk"
        FOREIGN KEY ("contact_submissions_id") REFERENCES "contact_submissions"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_contact_submissions_id_idx"
      ON "payload_locked_documents_rels" ("contact_submissions_id");

    ALTER TABLE "site_settings"
      ADD COLUMN IF NOT EXISTS "checkout_logo_id" integer;

    DO $$ BEGIN
      ALTER TABLE "site_settings"
        ADD CONSTRAINT "site_settings_checkout_logo_id_media_id_fk"
        FOREIGN KEY ("checkout_logo_id") REFERENCES "media"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS "site_settings_checkout_logo_idx"
      ON "site_settings" ("checkout_logo_id");

    ALTER TABLE "category_content"
      ADD COLUMN IF NOT EXISTS "filter_query" varchar;
  `);
}

/** @param {import('@payloadcms/db-postgres').MigrateDownArgs} args */
export async function down({ db }) {
  await db.execute(sql`
    ALTER TABLE "category_content" DROP COLUMN IF EXISTS "filter_query";

    DROP INDEX IF EXISTS "site_settings_checkout_logo_idx";
    ALTER TABLE "site_settings" DROP CONSTRAINT IF EXISTS "site_settings_checkout_logo_id_media_id_fk";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "checkout_logo_id";

    DROP INDEX IF EXISTS "payload_locked_documents_rels_contact_submissions_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_contact_submissions_fk";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "contact_submissions_id";

    DROP TABLE IF EXISTS "contact_submissions" CASCADE;
  `);
}
