"use server";

import { getCartById } from "@/lib/medusa/cart";
import { getCartId } from "@/lib/medusa/cookies";

export type PaymentReturnStatus =
  | { state: "pending" }
  | { state: "not_found" };

export async function getPaymentReturnStatusAction(
  cartId?: string | null
): Promise<PaymentReturnStatus> {
  const resolvedCartId = cartId || (await getCartId());

  if (!resolvedCartId) {
    return { state: "not_found" };
  }

  const cart = await getCartById(resolvedCartId);

  if (!cart) {
    return { state: "not_found" };
  }

  return { state: "pending" };
}
