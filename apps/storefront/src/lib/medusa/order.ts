import type { HttpTypes } from "@medusajs/types";
import { getMedusaClient } from "./client";
import medusaError from "./error";
import { enrichLineItems } from "./line-items";

export async function getOrder(id: string) {
  try {
    const medusa = await getMedusaClient();
    const { order } = await medusa.store.order.retrieve(id, {
      fields:
        "*payment_collections.payments,*shipping_methods,+items,+items.product.*,+items.variant.*,+items.thumbnail,+promotions.*",
    });
    return order;
  } catch (err) {
    return medusaError(err);
  }
}

export async function getEnrichedOrder(id: string) {
  const order = await getOrder(id);

  if (!order) {
    return null;
  }

  if (order?.items?.length) {
    const enrichedItems = await enrichLineItems(
      order.items,
      order.region_id ?? ""
    );
    order.items = enrichedItems as HttpTypes.StoreOrderLineItem[];
  }

  return order;
}
