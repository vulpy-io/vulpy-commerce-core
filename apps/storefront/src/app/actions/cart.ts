"use server";

import type { FetchError } from "@medusajs/js-sdk";
import config from "@/config";
import { getCart, getEnrichedCart } from "@/lib/medusa/cart";
import { getMedusaClient } from "@/lib/medusa/client";
import { getCartId, setCartId } from "@/lib/medusa/cookies";
import { getRegion } from "@/lib/medusa/regions";

const CART_FIELDS =
  "+items, +region, +items.product.*, +items.variant.image, +items.variant.*, +items.variant.inventory_quantity, +items.variant.manage_inventory, +items.thumbnail, +items.metadata, +promotions.*, +payment_collection, +payment_collection.payment_sessions";

async function createCart(regionId: string) {
  const medusa = await getMedusaClient();
  const cartResp = await medusa.store.cart.create(
    { region_id: regionId },
    { fields: CART_FIELDS }
  );
  await setCartId(cartResp.cart.id);
  return cartResp.cart;
}

async function getOrSetCart(countryCode: string) {
  let cart = await getCart();
  const region = await getRegion(countryCode);

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`);
  }

  if (!cart) {
    cart = await createCart(region.id);
  }

  if (cart && cart.region_id !== region.id) {
    const medusa = await getMedusaClient();
    await medusa.store.cart.update(cart.id, { region_id: region.id });
  }

  return cart;
}

export async function addToCartAction(input: {
  quantity: number;
  variantId: string;
  regionId?: string;
}) {
  let regionId = input.regionId;
  if (!regionId) {
    const region = await getRegion(config.defaultCountryCode);
    if (!region) {
      throw new Error("Region not found");
    }
    regionId = region.id;
  }

  const medusa = await getMedusaClient();
  const lineItemData = {
    quantity: input.quantity,
    variant_id: input.variantId,
  };

  let cartId = await getCartId();
  if (!cartId) {
    cartId = (await createCart(regionId)).id;
  }

  try {
    await medusa.store.cart.createLineItem(cartId, lineItemData);
  } catch (error) {
    const fetchError = error as FetchError;
    const message = fetchError.message?.toLowerCase() ?? "";
    const isCompletedCartError = message.includes("already completed");
    const shouldRecreateCart =
      fetchError.status === 404 ||
      fetchError.status === 500 ||
      (fetchError.status === 400 && isCompletedCartError);

    if (shouldRecreateCart) {
      cartId = (await createCart(regionId)).id;
      await medusa.store.cart.createLineItem(cartId, lineItemData);
    } else {
      throw new Error(fetchError.message ?? "Could not add to cart");
    }
  }

  return getEnrichedCart();
}

export async function updateCartQuantityAction(input: {
  countryCode?: string;
  lineItem: string;
  quantity: number;
}) {
  const cart = await getOrSetCart(
    input.countryCode ?? config.defaultCountryCode
  );

  if (!cart) {
    throw new Error("Could not get or create cart");
  }

  const medusa = await getMedusaClient();

  if (input.quantity > 0) {
    await medusa.store.cart.updateLineItem(cart.id, input.lineItem, {
      quantity: input.quantity,
    });
  } else {
    await medusa.store.cart.deleteLineItem(cart.id, input.lineItem);
  }

  return getEnrichedCart();
}

export async function removeLineItemAction(lineItemId: string) {
  const cartId = await getCartId();
  if (!cartId) {
    return null;
  }

  const medusa = await getMedusaClient();
  await medusa.store.cart.deleteLineItem(cartId, lineItemId);
  return getEnrichedCart();
}

export async function clearCartAction() {
  const cartId = await getCartId();
  if (!cartId) {
    return null;
  }

  const medusa = await getMedusaClient();
  const cart = await getCart();
  if (!cart?.items?.length) {
    return cart;
  }

  for (const item of cart.items) {
    if (item.id) {
      await medusa.store.cart.deleteLineItem(cartId, item.id);
    }
  }

  return getEnrichedCart();
}

export async function fetchCartAction() {
  return await getEnrichedCart();
}

export async function applyPromotionAction(code: string) {
  const cartId = await getCartId();
  if (!cartId) { return { error: "No cart found" }; }
  try {
    const medusa = await getMedusaClient();
    await medusa.store.cart.update(cartId, { promo_codes: [code] });
    const enriched = await getEnrichedCart();
    return { cart: enriched };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to apply promotion" };
  }
}

export async function removePromotionAction(_code: string) {
  const cartId = await getCartId();
  if (!cartId) { return { error: "No cart found" }; }
  try {
    const medusa = await getMedusaClient();
    await medusa.store.cart.update(cartId, { promo_codes: [] });
    const enriched = await getEnrichedCart();
    return { cart: enriched };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove promotion" };
  }
}
