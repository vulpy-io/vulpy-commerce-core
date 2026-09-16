import type { HttpTypes } from "@medusajs/types";
import config from "@/config";
import {
  buildCartIssues,
  isCheckoutBlocked,
  type StoreCartResult,
} from "./cart-issues";
import { inspectCartLineItems } from "./cart-validation.server";
import { getMedusaClient } from "./client";
import { getCartId } from "./cookies";
import { enrichLineItems } from "./line-items";
import { getRegion } from "./regions";

const CART_FIELDS =
  "+items, +region, +items.product.*, +items.variant.image, +items.variant.*, +items.thumbnail, +items.metadata, +promotions.*, +payment_collection, +payment_collection.payment_sessions";

export async function getCartById(cartId: string) {
  const medusa = await getMedusaClient();

  return await medusa.store.cart
    .retrieve(cartId, { fields: CART_FIELDS })
    .then(({ cart }) => cart)
    .catch(() => null);
}

const emptyCartResult: StoreCartResult = {
  cart: null,
  issues: [],
  checkoutBlocked: false,
};

export type { StoreCartResult } from "./cart-issues";

async function enrichCartItems(cart: HttpTypes.StoreCart, regionId: string) {
  if (!cart.items?.length) {
    return cart;
  }

  const enrichedItems = await enrichLineItems(cart.items, regionId);
  cart.items = enrichedItems as HttpTypes.StoreCartLineItem[];
  return cart;
}

export async function getCart() {
  const cartId = await getCartId();

  if (!cartId) {
    return null;
  }

  return getCartById(cartId);
}

export async function getEnrichedCart(): Promise<StoreCartResult> {
  let cart = await getCart();

  if (!cart) {
    return emptyCartResult;
  }

  const region = await getRegion(config.defaultCountryCode);
  const regionId = region?.id ?? cart.region_id ?? "";
  cart = await enrichCartItems(cart, regionId);

  const inspection = await inspectCartLineItems(cart.items ?? [], regionId);

  if (inspection.unavailableLineItemIds.length) {
    const medusa = await getMedusaClient();

    for (const lineItemId of inspection.unavailableLineItemIds) {
      await medusa.store.cart.deleteLineItem(cart.id, lineItemId);
    }

    cart = await getCart();
    if (!cart) {
      return {
        cart: null,
        issues: buildCartIssues(inspection),
        checkoutBlocked: isCheckoutBlocked(buildCartIssues(inspection)),
      };
    }

    cart = await enrichCartItems(cart, regionId);
  }

  const issues = buildCartIssues(inspection);

  return {
    cart,
    issues,
    checkoutBlocked: isCheckoutBlocked(issues),
  };
}
