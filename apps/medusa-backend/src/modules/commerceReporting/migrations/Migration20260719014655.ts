import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260719014655 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "daily_commerce_aggregate" ("id" text not null, "day" text not null, "currency_code" text not null default 'usd', "orders_placed" integer not null default 0, "orders_paid" integer not null default 0, "orders_cancelled" integer not null default 0, "orders_refunded" integer not null default 0, "orders_fulfilled" integer not null default 0, "units_sold" integer not null default 0, "gross_total" integer not null default 0, "subtotal_total" integer not null default 0, "tax_total" integer not null default 0, "shipping_total" integer not null default 0, "discount_total" integer not null default 0, "refund_total" integer not null default 0, "payment_card" integer not null default 0, "payment_cod" integer not null default 0, "payment_other" integer not null default 0, "inventory_rejected" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "daily_commerce_aggregate_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_daily_commerce_aggregate_deleted_at" ON "daily_commerce_aggregate" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "daily_commerce_aggregate" cascade;`);
  }

}
