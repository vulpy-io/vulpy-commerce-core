import { MedusaService } from "@medusajs/framework/utils";
import DailyCommerceAggregate from "./models/daily-commerce-aggregate";

export type CommerceLifecycleEvent =
  | "order_placed"
  | "order_paid"
  | "order_cancelled"
  | "order_refunded"
  | "order_fulfilled"
  | "inventory_rejected"
  | "payment_provider_outcome";

export interface RecordCommerceEventInput {
  event: CommerceLifecycleEvent;
  day?: string;
  currencyCode?: string;
  units?: number;
  gross?: number;
  subtotal?: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  refund?: number;
  paymentCategory?: "card" | "cod" | "other";
}

interface AggregateBucket {
  id: string;
  orders_placed?: number;
  orders_paid?: number;
  orders_cancelled?: number;
  orders_refunded?: number;
  orders_fulfilled?: number;
  units_sold?: number;
  gross_total?: number;
  subtotal_total?: number;
  tax_total?: number;
  shipping_total?: number;
  discount_total?: number;
  refund_total?: number;
  payment_card?: number;
  payment_cod?: number;
  payment_other?: number;
  inventory_rejected?: number;
}

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function add(current: number | undefined, delta: number): number {
  return (current ?? 0) + delta;
}

function buildEventPatch(
  bucket: AggregateBucket,
  input: RecordCommerceEventInput
): Record<string, number> {
  switch (input.event) {
    case "order_placed":
      return {
        orders_placed: add(bucket.orders_placed, 1),
        units_sold: add(bucket.units_sold, input.units ?? 0),
        gross_total: add(bucket.gross_total, input.gross ?? 0),
        subtotal_total: add(bucket.subtotal_total, input.subtotal ?? 0),
        tax_total: add(bucket.tax_total, input.tax ?? 0),
        shipping_total: add(bucket.shipping_total, input.shipping ?? 0),
        discount_total: add(bucket.discount_total, input.discount ?? 0),
      };
    case "order_paid":
      return { orders_paid: add(bucket.orders_paid, 1) };
    case "order_cancelled":
      return { orders_cancelled: add(bucket.orders_cancelled, 1) };
    case "order_refunded":
      return {
        orders_refunded: add(bucket.orders_refunded, 1),
        refund_total: add(bucket.refund_total, input.refund ?? 0),
      };
    case "order_fulfilled":
      return { orders_fulfilled: add(bucket.orders_fulfilled, 1) };
    case "inventory_rejected":
      return { inventory_rejected: add(bucket.inventory_rejected, 1) };
    case "payment_provider_outcome":
      if (input.paymentCategory === "card") {
        return { payment_card: add(bucket.payment_card, 1) };
      }
      if (input.paymentCategory === "cod") {
        return { payment_cod: add(bucket.payment_cod, 1) };
      }
      return { payment_other: add(bucket.payment_other, 1) };
    default:
      return {};
  }
}

class CommerceReportingModuleService extends MedusaService({
  DailyCommerceAggregate,
}) {
  async ensureDayBucket(day: string, currencyCode: string) {
    const existing = await this.listDailyCommerceAggregates({
      day,
      currency_code: currencyCode,
    });
    if (existing[0]) {
      return existing[0];
    }
    const created = await this.createDailyCommerceAggregates({
      day,
      currency_code: currencyCode,
    });
    return Array.isArray(created) ? created[0] : created;
  }

  async recordEvent(input: RecordCommerceEventInput) {
    const day = input.day ?? utcDay();
    const currencyCode = (input.currencyCode ?? "usd").toLowerCase();
    const bucket = await this.ensureDayBucket(day, currencyCode);
    const patch = buildEventPatch(bucket as AggregateBucket, input);

    if (!Object.keys(patch).length) {
      return bucket;
    }

    return this.updateDailyCommerceAggregates({
      id: bucket.id,
      ...patch,
    });
  }
}

export default CommerceReportingModuleService;
