/**
 * Contract tests for the Stripe payment server actions.
 *
 * Verifies that:
 *   1. initiatePaymentSessionAction is an exported async function
 *   2. placeOrderAction (the completeOrder action) is an exported async function
 *   3. initiatePaymentSessionAction returns an error-shaped result when the
 *      cart SDK call fails (mocked)
 *   4. placeOrderAction returns a success-shaped result on a completed order
 *      (mocked)
 *
 * Server actions cannot be invoked with real Next.js cookies in Vitest, so all
 * Next.js server-runtime modules (cookies, revalidatePath, redirect) are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Next.js server runtime mocks ─────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // Simulate next/navigation redirect throwing a redirect error (as in production)
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as Record<string, unknown>).digest = `NEXT_REDIRECT;push;${url};303;`;
    throw err;
  }),
}));
vi.mock("next/dist/client/components/redirect-error", () => ({
  isRedirectError: (e: unknown) =>
    e instanceof Error && (e as Error).message.startsWith("NEXT_REDIRECT:"),
}));

// ── Medusa cookie helpers ─────────────────────────────────────────────────────
vi.mock("@/lib/medusa/cookies", () => ({
  getCartId: vi.fn(),
  setCartId: vi.fn(),
  removeCartId: vi.fn(),
}));

// ── Medusa cart helpers ───────────────────────────────────────────────────────
vi.mock("@/lib/medusa/cart", () => ({
  getCart: vi.fn(),
  getCartById: vi.fn(),
  getEnrichedCart: vi.fn(),
}));

// ── Medusa customer helper ────────────────────────────────────────────────────
vi.mock("@/lib/medusa/customer", () => ({
  getCustomer: vi.fn().mockResolvedValue(null),
}));

// ── Medusa error helper ───────────────────────────────────────────────────────
vi.mock("@/lib/medusa/error", () => ({
  default: vi.fn((err: unknown) => {
    throw new Error(err instanceof Error ? err.message : String(err));
  }),
}));

// ── Medusa SDK client ─────────────────────────────────────────────────────────
const mockInitiatePaymentSession = vi.fn();
const mockCompleteCart = vi.fn();
const mockRetrieveCart = vi.fn();

vi.mock("@/lib/medusa/client", () => ({
  getMedusaClient: vi.fn().mockResolvedValue({
    store: {
      payment: {
        initiatePaymentSession: mockInitiatePaymentSession,
      },
      cart: {
        complete: mockCompleteCart,
        retrieve: mockRetrieveCart,
      },
    },
  }),
}));

// ── Config ────────────────────────────────────────────────────────────────────
vi.mock("@/config", () => ({
  default: { defaultCountryCode: "us", customerAccountsEnabled: false },
}));

// ─────────────────────────────────────────────────────────────────────────────

import { getCartById, getEnrichedCart } from "@/lib/medusa/cart";
import { getCartId, removeCartId } from "@/lib/medusa/cookies";

describe("initiatePaymentSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("is an exported async function", async () => {
    const { initiatePaymentSessionAction } = await import("@/app/actions/order");
    expect(typeof initiatePaymentSessionAction).toBe("function");
    expect(initiatePaymentSessionAction.constructor.name).toBe("AsyncFunction");
  });

  it("returns error result when cart is not found", async () => {
    vi.mocked(getCartById).mockResolvedValueOnce(null as never);
    const { initiatePaymentSessionAction } = await import("@/app/actions/order");
    await expect(
      initiatePaymentSessionAction("cart_missing", "pp_stripe_stripe")
    ).rejects.toThrow("Cart not found");
  });

  it("returns success result when payment session is initiated", async () => {
    vi.mocked(getCartById).mockResolvedValueOnce({
      id: "cart_123",
    } as never);
    mockInitiatePaymentSession.mockResolvedValueOnce({
      payment_collection: { id: "paycol_abc" },
    });
    vi.mocked(getEnrichedCart).mockResolvedValueOnce({
      cart: { id: "cart_123", payment_collection: { payment_sessions: [] } },
    } as never);

    const { initiatePaymentSessionAction } = await import("@/app/actions/order");
    const result = await initiatePaymentSessionAction("cart_123", "pp_stripe_stripe");
    expect(result).toMatchObject({ status: "success" });
  });

  it("returns a user-friendly error when provider is not enabled for the region", async () => {
    vi.mocked(getCartById).mockResolvedValueOnce({
      id: "cart_123",
    } as never);
    mockInitiatePaymentSession.mockRejectedValueOnce(
      new Error("Payment provider pp_stripe_stripe is not enabled in region reg_us")
    );

    const { initiatePaymentSessionAction } = await import("@/app/actions/order");
    const result = await initiatePaymentSessionAction("cart_123", "pp_stripe_stripe");
    expect(result).toMatchObject({
      status: "error",
      error: "Stripe is not enabled for your region. Please contact support.",
    });
    expect(result).toHaveProperty("cart", null);
    expect(result).toHaveProperty("checkoutBlocked", false);
  });

  it("returns the raw medusaError for non-region payment errors", async () => {
    vi.mocked(getCartById).mockResolvedValueOnce({
      id: "cart_123",
    } as never);
    mockInitiatePaymentSession.mockRejectedValueOnce(
      new Error("Some other payment error")
    );

    const { initiatePaymentSessionAction } = await import("@/app/actions/order");
    const result = await initiatePaymentSessionAction("cart_123", "pp_stripe_stripe");
    // medusaError mock returns { error: String(err) }
    expect(result).toMatchObject({ error: expect.any(String) });
    expect((result as { error: string }).error).not.toContain("region");
  });
});

describe("placeOrderAction (completeOrder)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("is an exported async function", async () => {
    const { placeOrderAction } = await import("@/app/actions/order");
    expect(typeof placeOrderAction).toBe("function");
    expect(placeOrderAction.constructor.name).toBe("AsyncFunction");
  });

  it("throws when there is no cart id in the session", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce(null as never);
    const { placeOrderAction } = await import("@/app/actions/order");
    await expect(placeOrderAction()).rejects.toThrow(
      "No existing cart found when placing an order"
    );
  });

  it("redirects to /order/confirmed/:id when the order completes successfully", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_xyz" as never);
    vi.mocked(removeCartId).mockResolvedValueOnce(undefined as never);
    mockRetrieveCart.mockResolvedValueOnce({
      cart: { id: "cart_xyz", completed_at: null },
    });
    mockCompleteCart.mockResolvedValueOnce({
      type: "order",
      order: { id: "order_abc" },
    });

    const { placeOrderAction } = await import("@/app/actions/order");
    // redirect() throws a special next error — catch it and check URL
    await expect(placeOrderAction()).rejects.toThrow(
      "NEXT_REDIRECT:/order/confirmed/order_abc"
    );
  });

  it("returns { error } when sdk.store.cart.complete throws", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_xyz" as never);
    mockRetrieveCart.mockResolvedValueOnce({
      cart: { id: "cart_xyz", completed_at: null },
    });
    mockCompleteCart.mockRejectedValueOnce(new Error("Network failure"));

    const { placeOrderAction } = await import("@/app/actions/order");
    const result = await placeOrderAction();
    expect(result).toMatchObject({ error: "Network failure" });
  });

  it("returns { error } when cart.complete resolves with type 'cart' (not an order)", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_xyz" as never);
    mockRetrieveCart.mockResolvedValueOnce({
      cart: { id: "cart_xyz", completed_at: null },
    });
    mockCompleteCart.mockResolvedValueOnce({
      type: "cart",
      cart: { id: "cart_xyz" },
    });

    const { placeOrderAction } = await import("@/app/actions/order");
    const result = await placeOrderAction();
    expect(result).toMatchObject({ error: expect.any(String) });
    expect((result as { error: string }).error).not.toBe("");
  });

  it("returns { status: 'already_completed' } when cart already has completed_at", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_xyz" as never);
    mockRetrieveCart.mockResolvedValueOnce({
      cart: { id: "cart_xyz", completed_at: "2024-01-01T00:00:00.000Z" },
    });

    const { placeOrderAction } = await import("@/app/actions/order");
    const result = await placeOrderAction();
    expect(result).toEqual({ status: "already_completed" });
  });

  it("proceeds with cart.complete when cart does NOT have completed_at", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_xyz" as never);
    mockRetrieveCart.mockResolvedValueOnce({
      cart: { id: "cart_xyz", completed_at: null },
    });
    vi.mocked(removeCartId).mockResolvedValueOnce(undefined as never);
    mockCompleteCart.mockResolvedValueOnce({
      type: "order",
      order: { id: "order_abc" },
    });

    const { placeOrderAction } = await import("@/app/actions/order");
    await expect(placeOrderAction()).rejects.toThrow(
      "NEXT_REDIRECT:/order/confirmed/order_abc"
    );
  });
});
