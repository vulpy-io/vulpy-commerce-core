import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  COMMERCE_REPORTING_MODULE,
} from "../modules/commerceReporting";
import type CommerceReportingModuleService from "../modules/commerceReporting/service";

interface OrderPayload {
  id: string;
}

function paymentCategoryFromProvider(providerId: string | undefined): "card" | "cod" | "other" {
  const id = (providerId ?? "").toLowerCase();
  if (id.includes("stripe")) {
    return "card";
  }
  if (id.includes("system") || id.includes("manual")) {
    return "cod";
  }
  return "other";
}

async function loadOrderTotals(container: SubscriberArgs["container"], orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "currency_code",
      "total",
      "subtotal",
      "tax_total",
      "shipping_total",
      "discount_total",
      "items.quantity",
      "payment_collections.payment_sessions.provider_id",
    ],
    filters: { id: orderId },
  });

  const order = data?.[0] as
    | {
        currency_code?: string;
        total?: number;
        subtotal?: number;
        tax_total?: number;
        shipping_total?: number;
        discount_total?: number;
        items?: Array<{ quantity?: number }>;
        payment_collections?: Array<{
          payment_sessions?: Array<{ provider_id?: string }>;
        }>;
      }
    | undefined;

  if (!order) {
    return null;
  }

  const units = (order.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0
  );
  const providerId =
    order.payment_collections?.[0]?.payment_sessions?.[0]?.provider_id;

  return {
    currencyCode: order.currency_code ?? "usd",
    units,
    gross: Number(order.total ?? 0),
    subtotal: Number(order.subtotal ?? 0),
    tax: Number(order.tax_total ?? 0),
    shipping: Number(order.shipping_total ?? 0),
    discount: Math.abs(Number(order.discount_total ?? 0)),
    paymentCategory: paymentCategoryFromProvider(providerId),
  };
}

export default async function commerceReportingHandler({
  event,
  container,
}: SubscriberArgs<OrderPayload>) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const eventName =
    (event as { eventName?: string; name?: string }).eventName ||
    (event as { eventName?: string; name?: string }).name ||
    "";

  const reporting = container.resolve<CommerceReportingModuleService>(
    COMMERCE_REPORTING_MODULE
  );

  try {
    if (eventName === "order.placed") {
      const totals = await loadOrderTotals(container, event.data.id);
      if (!totals) {
        return;
      }
      await reporting.recordEvent({
        event: "order_placed",
        currencyCode: totals.currencyCode,
        units: totals.units,
        gross: totals.gross,
        subtotal: totals.subtotal,
        tax: totals.tax,
        shipping: totals.shipping,
        discount: totals.discount,
      });
      await reporting.recordEvent({
        event: "payment_provider_outcome",
        currencyCode: totals.currencyCode,
        paymentCategory: totals.paymentCategory,
      });
      return;
    }

    if (
      eventName === "order.payment_captured" ||
      eventName === "order.completed"
    ) {
      await reporting.recordEvent({ event: "order_paid" });
      return;
    }

    if (eventName === "order.canceled") {
      await reporting.recordEvent({ event: "order_cancelled" });
      return;
    }

    if (eventName === "order.fulfillment_created") {
      await reporting.recordEvent({ event: "order_fulfilled" });
      return;
    }

    if (eventName === "order.refund_created") {
      const totals = await loadOrderTotals(container, event.data.id);
      await reporting.recordEvent({
        event: "order_refunded",
        currencyCode: totals?.currencyCode,
        refund: totals?.gross,
      });
    }
  } catch (error) {
    logger.error(
      `[commerce-reporting] status=error event=${eventName} order_id=${event.data.id} error=${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export const config: SubscriberConfig = {
  event: [
    "order.placed",
    "order.payment_captured",
    "order.completed",
    "order.canceled",
    "order.fulfillment_created",
    "order.refund_created",
  ],
};
