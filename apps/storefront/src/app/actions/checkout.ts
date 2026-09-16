"use server";

import {
  listCartPaymentMethods,
  listCartShippingMethods,
} from "@/lib/medusa/fulfillment";

export async function getShippingOptionsAction(cartId: string) {
  return await listCartShippingMethods(cartId);
}

export async function getPaymentProvidersAction(regionId: string) {
  return await listCartPaymentMethods(regionId);
}
