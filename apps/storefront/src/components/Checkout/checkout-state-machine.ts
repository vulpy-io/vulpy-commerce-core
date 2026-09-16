/**
 * Checkout state machine — pure transition functions, no React, no side effects.
 *
 * Usage in components:
 *   const [state, dispatch] = useReducer(reduce, { step: 'editing' });
 *   dispatch({ type: 'SAVE_CART' });
 *   dispatch({ type: 'ORDER_COMPLETE', orderId: 'order_abc' });
 */

export type CheckoutState =
  | { step: "editing" }
  | { step: "saving_cart" }
  | { step: "payment_ready" }
  | { step: "confirming" }
  | { step: "completing_order" }
  | { step: "confirmed"; orderId: string }
  | { step: "error"; message: string; recoverable: boolean };

export type CheckoutEvent =
  | "SAVE_CART"
  | "SAVE_CART_DONE"
  | "SAVE_CART_ERROR"
  | "PAYMENT_READY"
  | "CONFIRM"
  | "CONFIRM_ERROR"
  | "PLACE_ORDER"
  | "ORDER_COMPLETE"
  | "ORDER_ERROR"
  | "RETRY";

export type CheckoutEventPayload = {
  orderId?: string;
  message?: string;
  recoverable?: boolean;
};

export type CheckoutAction = CheckoutEventPayload & { type: CheckoutEvent };

/**
 * Pure state transition function — also works as a useReducer reducer.
 *
 * @param state   Current state
 * @param action  Action with type and optional payload fields
 * @returns       Next state
 */
export function transition(
  state: CheckoutState,
  action: CheckoutAction
): CheckoutState {
  const { type, orderId, message, recoverable } = action;

  switch (state.step) {
    case "editing": {
      if (type === "SAVE_CART") {
        return { step: "saving_cart" };
      }
      return state;
    }

    case "saving_cart": {
      if (type === "SAVE_CART_DONE") {
        return { step: "payment_ready" };
      }
      if (type === "SAVE_CART_ERROR") {
        return {
          step: "error",
          message: message ?? "Could not save checkout details",
          recoverable: true,
        };
      }
      return state;
    }

    case "payment_ready": {
      if (type === "CONFIRM") {
        return { step: "confirming" };
      }
      if (type === "PAYMENT_READY") {
        return { step: "payment_ready" };
      }
      return state;
    }

    case "confirming": {
      // Idempotency: ignore duplicate CONFIRM
      if (type === "CONFIRM") {
        return state;
      }
      if (type === "CONFIRM_ERROR") {
        return {
          step: "error",
          message: message ?? "Payment confirmation failed",
          recoverable: true,
        };
      }
      if (type === "PLACE_ORDER") {
        return { step: "completing_order" };
      }
      return state;
    }

    case "completing_order": {
      // Idempotency: ignore duplicate PLACE_ORDER
      if (type === "PLACE_ORDER") {
        return state;
      }
      if (type === "ORDER_COMPLETE") {
        return { step: "confirmed", orderId: orderId ?? "" };
      }
      if (type === "ORDER_ERROR") {
        return {
          step: "error",
          message: message ?? "Order could not be completed",
          recoverable: recoverable ?? true,
        };
      }
      return state;
    }

    case "error": {
      if (type === "RETRY") {
        // Recoverable → back to payment_ready; non-recoverable → back to editing
        return state.recoverable
          ? { step: "payment_ready" }
          : { step: "editing" };
      }
      return state;
    }

    case "confirmed": {
      // Terminal state — ignore all events
      return state;
    }

    default: {
      return state;
    }
  }
}

