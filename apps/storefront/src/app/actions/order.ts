"use server";

import type { HttpTypes } from "@medusajs/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCart, getCartById, getEnrichedCart } from "@/lib/medusa/cart";
import type { EnrichedCartResult } from "@/lib/medusa/cart-result";
import { getMedusaClient } from "@/lib/medusa/client";
import { getCartId, removeCartId } from "@/lib/medusa/cookies";
import { getCustomer } from "@/lib/medusa/customer";
import medusaError from "@/lib/medusa/error";

async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId();
  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating");
  }

  try {
    const medusa = await getMedusaClient();
    const { cart } = await medusa.store.cart.update(cartId, data);
    return cart;
  } catch (error) {
    return medusaError(error);
  }
}

type CheckoutAddress = Pick<
  HttpTypes.StoreCartAddress,
  | "first_name"
  | "last_name"
  | "address_1"
  | "address_2"
  | "city"
  | "country_code"
  | "postal_code"
  | "province"
  | "phone"
  | "company"
  | "metadata"
>;

export async function setCheckoutAddressesAction(data: {
  email?: string;
  shipping_address: CheckoutAddress;
  billing_address?: CheckoutAddress;
}) {
  const cartId = await getCartId();

  if (!cartId) {
    throw new Error("No existing cart found when setting addresses");
  }

  const customer = await getCustomer();
  const trimmedEmail = data.email?.trim();

  const updateData: HttpTypes.StoreUpdateCart = {
    ...(trimmedEmail ? { email: trimmedEmail } : customer?.email ? { email: customer.email } : {}),
    shipping_address: {
      ...data.shipping_address,
      address_2: data.shipping_address.address_2 ?? "",
    },
    ...(data.billing_address
      ? {
          billing_address: {
            ...data.billing_address,
            address_2: data.billing_address.address_2 ?? "",
          },
        }
      : {}),
  };

  await updateCart(updateData);
  return getEnrichedCart();
}

export async function setShippingMethodAction(
  shippingMethodId: string,
  data?: Record<string, unknown>
) {
  const cart = await getCart();

  if (!cart) {
    throw new Error("No cart found");
  }

  try {
    const medusa = await getMedusaClient();
    await medusa.store.cart.addShippingMethod(cart.id, {
      option_id: shippingMethodId,
      ...(data ? { data } : {}),
    });
    return getEnrichedCart();
  } catch (error) {
    return medusaError(error);
  }
}

export type InitiatePaymentSessionResult =
  | (EnrichedCartResult & { status: "success" })
  | (EnrichedCartResult & { status: "error"; error: string });

export async function initiatePaymentSessionAction(
  cartId: string,
  providerId: string
): Promise<InitiatePaymentSessionResult> {
  const cart = await getCartById(cartId);

  if (!cart) {
    throw new Error("Cart not found");
  }

  try {
    const medusa = await getMedusaClient();
    const res = await medusa.store.payment.initiatePaymentSession(cart, {
      provider_id: providerId,
      data: { cart_id: cart.id },
    });

    if (res.payment_collection) {
      const enriched = await getEnrichedCart();
      revalidatePath("/checkout");
      return { status: "success" as const, ...enriched };
    }

    return {
      status: "error" as const,
      cart: null,
      issues: [],
      checkoutBlocked: false,
      error: "Payment session could not be initiated.",
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.toLowerCase() : "";
    if (
      msg.includes("not enabled") &&
      (msg.includes("region") || msg.includes("provider"))
    ) {
      return {
        status: "error" as const,
        cart: null,
        issues: [],
        checkoutBlocked: false,
        error: "Stripe is not enabled for your region. Please contact support.",
      };
    }
    let message = "Payment session failed.";
    try {
      medusaError(error);
    } catch (e) {
      message = e instanceof Error ? e.message : message;
    }
    return {
      status: "error" as const,
      cart: null,
      issues: [],
      checkoutBlocked: false,
      error: message,
    };
  }
}

export type PlaceOrderResult =
  | { status: "success"; orderId: string }
  | { status: "already_completed" }
  | { error: string; recoverable: boolean };

export async function placeOrderAction(): Promise<PlaceOrderResult> {
  const cartId = await getCartId();

  if (!cartId) {
    throw new Error("No existing cart found when placing an order");
  }

  try {
    const medusa = await getMedusaClient();

    // Idempotency check — prevent double-charges on duplicate submits
    const cartCheck = await medusa.store.cart.retrieve(cartId);
    if (cartCheck.cart.completed_at) {
      return { status: "already_completed" };
    }

    const cartRes = await medusa.store.cart.complete(cartId);

    if (cartRes.type === "order") {
      await removeCartId();
      revalidatePath("/", "layout");
      redirect(`/order/confirmed/${cartRes.order.id}`);
    }

    return {
      error: "Order could not be completed. Please try again.",
      recoverable: true,
    };
  } catch (error) {
    // Re-throw Next.js redirect errors — they must propagate
    const digest = (error as { digest?: string })?.digest ?? "";
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return {
      error:
        error instanceof Error ? error.message : "Could not complete order",
      recoverable: false,
    };
  }
}
