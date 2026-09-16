/**
 * Unit tests for the checkout state machine.
 * Tests every transition defined in checkout-state-machine.ts.
 */
import { describe, expect, it } from "vitest";
import type { CheckoutAction, CheckoutState } from "./checkout-state-machine";
import { transition } from "./checkout-state-machine";

const act = (type: CheckoutAction["type"], payload?: Omit<CheckoutAction, "type">): CheckoutAction =>
  ({ type, ...payload } as CheckoutAction);

describe("transition — from editing", () => {
  it("SAVE_CART → saving_cart", () => {
    const next = transition({ step: "editing" }, act("SAVE_CART"));
    expect(next).toEqual({ step: "saving_cart" });
  });

  it("ignores unknown events", () => {
    const state: CheckoutState = { step: "editing" };
    const next = transition(state, act("RETRY"));
    expect(next).toEqual(state);
  });
});

describe("transition — from saving_cart", () => {
  it("SAVE_CART_DONE → payment_ready", () => {
    const next = transition({ step: "saving_cart" }, act("SAVE_CART_DONE"));
    expect(next).toEqual({ step: "payment_ready" });
  });

  it("SAVE_CART_ERROR → error (recoverable)", () => {
    const next = transition({ step: "saving_cart" }, act("SAVE_CART_ERROR"));
    expect(next).toEqual({ step: "error", message: expect.any(String), recoverable: true });
  });
});

describe("transition — from payment_ready", () => {
  it("CONFIRM → confirming", () => {
    const next = transition({ step: "payment_ready" }, act("CONFIRM"));
    expect(next).toEqual({ step: "confirming" });
  });

  it("PAYMENT_READY → payment_ready (stays ready)", () => {
    const next = transition({ step: "payment_ready" }, act("PAYMENT_READY"));
    expect(next).toEqual({ step: "payment_ready" });
  });
});

describe("transition — from confirming (idempotency)", () => {
  it("CONFIRM is ignored (duplicate confirm → stays confirming)", () => {
    const state: CheckoutState = { step: "confirming" };
    const next = transition(state, act("CONFIRM"));
    expect(next).toEqual({ step: "confirming" });
  });

  it("CONFIRM_ERROR → error with recoverable true", () => {
    const next = transition({ step: "confirming" }, act("CONFIRM_ERROR"));
    expect(next).toEqual({ step: "error", message: expect.any(String), recoverable: true });
  });

  it("PLACE_ORDER → completing_order", () => {
    const next = transition({ step: "confirming" }, act("PLACE_ORDER"));
    expect(next).toEqual({ step: "completing_order" });
  });
});

describe("transition — from completing_order (idempotency)", () => {
  it("PLACE_ORDER is ignored (duplicate place_order → stays completing_order)", () => {
    const state: CheckoutState = { step: "completing_order" };
    const next = transition(state, act("PLACE_ORDER"));
    expect(next).toEqual({ step: "completing_order" });
  });

  it("ORDER_COMPLETE → confirmed with orderId", () => {
    const next = transition({ step: "completing_order" }, act("ORDER_COMPLETE", { orderId: "order_abc" }));
    expect(next).toEqual({ step: "confirmed", orderId: "order_abc" });
  });

  it("ORDER_ERROR → error with recoverable true", () => {
    const next = transition({ step: "completing_order" }, act("ORDER_ERROR", { recoverable: true }));
    expect(next).toEqual({ step: "error", message: expect.any(String), recoverable: true });
  });

  it("ORDER_ERROR → error with recoverable false", () => {
    const next = transition({ step: "completing_order" }, act("ORDER_ERROR", { recoverable: false }));
    expect(next).toEqual({ step: "error", message: expect.any(String), recoverable: false });
  });
});

describe("transition — from error (retry logic)", () => {
  it("RETRY from recoverable error → payment_ready", () => {
    const state: CheckoutState = { step: "error", message: "Payment failed", recoverable: true };
    const next = transition(state, act("RETRY"));
    expect(next).toEqual({ step: "payment_ready" });
  });

  it("RETRY from non-recoverable error → editing", () => {
    const state: CheckoutState = { step: "error", message: "Fatal error", recoverable: false };
    const next = transition(state, act("RETRY"));
    expect(next).toEqual({ step: "editing" });
  });
});

describe("transition — from confirmed", () => {
  it("ignores all events once confirmed", () => {
    const state: CheckoutState = { step: "confirmed", orderId: "order_abc" };
    const next = transition(state, act("RETRY"));
    expect(next).toEqual(state);
  });
});

describe("happy path sequence", () => {
  it("editing → saving_cart → payment_ready → confirming → completing_order → confirmed", () => {
    let state: CheckoutState = { step: "editing" };
    state = transition(state, act("SAVE_CART"));
    expect(state.step).toBe("saving_cart");

    state = transition(state, act("SAVE_CART_DONE"));
    expect(state.step).toBe("payment_ready");

    state = transition(state, act("CONFIRM"));
    expect(state.step).toBe("confirming");

    state = transition(state, act("PLACE_ORDER"));
    expect(state.step).toBe("completing_order");

    state = transition(state, act("ORDER_COMPLETE", { orderId: "order_xyz" }));
    expect(state.step).toBe("confirmed");
    expect((state as { step: "confirmed"; orderId: string }).orderId).toBe("order_xyz");
  });
});

describe("error → retry → back to payment_ready sequence", () => {
  it("recoverable error retries back to payment_ready", () => {
    let state: CheckoutState = { step: "completing_order" };
    state = transition(state, act("ORDER_ERROR", { recoverable: true }));
    expect(state.step).toBe("error");
    expect((state as { step: "error"; recoverable: boolean }).recoverable).toBe(true);

    state = transition(state, act("RETRY"));
    expect(state.step).toBe("payment_ready");
  });

  it("non-recoverable error retries back to editing", () => {
    let state: CheckoutState = { step: "completing_order" };
    state = transition(state, act("ORDER_ERROR", { recoverable: false }));
    state = transition(state, act("RETRY"));
    expect(state.step).toBe("editing");
  });
});
