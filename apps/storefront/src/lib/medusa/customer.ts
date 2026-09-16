import { cache } from "react";
import { getMedusaClient } from "./client";

export const getCustomer = cache(async () => {
  const medusa = await getMedusaClient();
  return medusa.store.customer
    .retrieve({
      fields: "*addresses",
    })
    .then(({ customer }) => customer)
    .catch(() => null);
});

export const listCustomerOrders = cache(async () => {
  const medusa = await getMedusaClient();
  return medusa.store.order
    .list({
      limit: 20,
      fields:
        "*items,*items.product,*items.variant,*shipping_address,*billing_address",
    })
    .then(({ orders }) => orders)
    .catch(() => []);
});
