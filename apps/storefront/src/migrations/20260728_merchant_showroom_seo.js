import { sql } from "@payloadcms/db-postgres";

/** @param {import('@payloadcms/db-postgres').MigrateUpArgs} args */
export async function up({ db }) {
  await db.execute(sql`
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_return_days" numeric;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_return_fees" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_return_method" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_return_country" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_shipping_rate" numeric;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_shipping_currency" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_delivery_time_min_days" numeric;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_delivery_time_max_days" numeric;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "merchant_listing_shipping_destination_country" varchar;

    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_enabled" boolean DEFAULT false;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_name" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_type" varchar DEFAULT 'Store';
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_street_address" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_address_locality" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_address_region" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_postal_code" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_address_country" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_telephone" varchar;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_latitude" numeric;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_longitude" numeric;
    ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "showroom_opening_hours" varchar;
  `);
}

/** @param {import('@payloadcms/db-postgres').MigrateDownArgs} args */
export async function down({ db }) {
  await db.execute(sql`
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_return_days";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_return_fees";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_return_method";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_return_country";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_shipping_rate";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_shipping_currency";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_delivery_time_min_days";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_delivery_time_max_days";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "merchant_listing_shipping_destination_country";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_enabled";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_name";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_type";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_street_address";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_address_locality";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_address_region";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_postal_code";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_address_country";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_telephone";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_latitude";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_longitude";
    ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "showroom_opening_hours";
  `);
}
