import { getMedusaClient } from "./client";

export const listCartShippingMethods = async (cartId: string) => {
  const medusa = await getMedusaClient();
  return medusa.store.fulfillment
    .listCartOptions({ cart_id: cartId })
    .then(({ shipping_options }) => shipping_options)
    .catch(() => null);
};

export const listCartPaymentMethods = async (regionId: string) => {
  const medusa = await getMedusaClient();
  return medusa.store.payment
    .listPaymentProviders({ region_id: regionId })
    .then(({ payment_providers }) => payment_providers)
    .catch(() => null);
};
