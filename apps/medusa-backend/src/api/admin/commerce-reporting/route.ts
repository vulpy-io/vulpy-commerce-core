import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { COMMERCE_REPORTING_MODULE } from "../../../modules/commerceReporting";
import type CommerceReportingModuleService from "../../../modules/commerceReporting/service";

/**
 * Admin aggregate commerce reporting (consent-free operational lane).
 * Returns daily buckets only — no customer/visitor identifiers.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const reporting = req.scope.resolve<CommerceReportingModuleService>(
    COMMERCE_REPORTING_MODULE
  );

  const limit = Math.min(Number(req.query.limit ?? 90), 365);
  const aggregates = await reporting.listDailyCommerceAggregates(
    {},
    { take: limit, order: { day: "DESC" } }
  );

  const rows = aggregates.map((row) => ({
    day: row.day,
    currency_code: row.currency_code,
    orders_placed: row.orders_placed,
    orders_paid: row.orders_paid,
    orders_cancelled: row.orders_cancelled,
    orders_refunded: row.orders_refunded,
    orders_fulfilled: row.orders_fulfilled,
    units_sold: row.units_sold,
    gross_total: row.gross_total,
    subtotal_total: row.subtotal_total,
    tax_total: row.tax_total,
    shipping_total: row.shipping_total,
    discount_total: row.discount_total,
    refund_total: row.refund_total,
    payment_card: row.payment_card,
    payment_cod: row.payment_cod,
    payment_other: row.payment_other,
    inventory_rejected: row.inventory_rejected,
    average_order_value:
      row.orders_placed > 0 ? row.gross_total / row.orders_placed : 0,
  }));

  res.json({ aggregates: rows });
}
