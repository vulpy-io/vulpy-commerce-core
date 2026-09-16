import { model } from "@medusajs/framework/utils";

/**
 * Consent-free daily commerce aggregates. No visitor IDs, emails, IPs, or URLs.
 */
const DailyCommerceAggregate = model.define("daily_commerce_aggregate", {
  id: model.id().primaryKey(),
  day: model.text(),
  currency_code: model.text().default("usd"),
  orders_placed: model.number().default(0),
  orders_paid: model.number().default(0),
  orders_cancelled: model.number().default(0),
  orders_refunded: model.number().default(0),
  orders_fulfilled: model.number().default(0),
  units_sold: model.number().default(0),
  gross_total: model.number().default(0),
  subtotal_total: model.number().default(0),
  tax_total: model.number().default(0),
  shipping_total: model.number().default(0),
  discount_total: model.number().default(0),
  refund_total: model.number().default(0),
  payment_card: model.number().default(0),
  payment_cod: model.number().default(0),
  payment_other: model.number().default(0),
  inventory_rejected: model.number().default(0),
});

export default DailyCommerceAggregate;
