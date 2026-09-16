"use server";

import { placeOrderAction } from "@/app/actions/order";
import { getMedusaClient } from "@/lib/medusa/client";
import { getCartId } from "@/lib/medusa/cookies";
import { type PollResult, pollPaymentReturn } from "@/lib/medusa/payment-return-poller";

/**
 * Server action wrapping the full payment-return polling loop.
 *
 * This is the only bridge between the client-side poller component and
 * server-only modules (next/headers for cookies, Medusa SDK for cart
 * retrieval).  The client component calls this in a loop with delays;
 * the polling logic itself is the pure `pollPaymentReturn` function.
 */
export async function pollPaymentReturnServerAction(): Promise<PollResult> {
  return await pollPaymentReturn({
    getCartId,
    retrieveCart: async (cartId: string) => {
      const medusa = await getMedusaClient();
      return medusa.store.cart.retrieve(cartId);
    },
    placeOrder: placeOrderAction,
    delay: (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });
}