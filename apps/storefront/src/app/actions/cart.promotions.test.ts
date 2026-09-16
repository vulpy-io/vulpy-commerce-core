/**
 * Contract tests for promotion server actions.
 *
 * Covers:
 *   1. applyPromotionAction — exported async function
 *   2. applyPromotionAction — returns { error } when no cart id
 *   3. applyPromotionAction — calls sdk.store.cart.update with promo_codes
 *   4. applyPromotionAction — returns enriched cart on success
 *   5. applyPromotionAction — returns { error } on SDK error
 *   6. removePromotionAction — exported async function
 *   7. removePromotionAction — returns { error } when no cart id
 *   8. removePromotionAction — calls sdk.store.cart.update with empty promo_codes
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Next.js server runtime mocks ──────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

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
  default: vi.fn((err: unknown) => ({ error: String(err) })),
}));

// ── Medusa config ─────────────────────────────────────────────────────────────
vi.mock("@/config", () => ({
  default: { defaultCountryCode: "us", customerAccountsEnabled: false },
}));

// ── Medusa SDK client ─────────────────────────────────────────────────────────
const mockCartUpdate = vi.fn();

vi.mock("@/lib/medusa/client", () => ({
  getMedusaClient: vi.fn().mockResolvedValue({
    store: {
      cart: {
        update: mockCartUpdate,
      },
    },
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────

import { getEnrichedCart } from "@/lib/medusa/cart";
import { getCartId } from "@/lib/medusa/cookies";

describe("applyPromotionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("is an exported async function", async () => {
    const { applyPromotionAction } = await import("@/app/actions/cart");
    expect(typeof applyPromotionAction).toBe("function");
    expect(applyPromotionAction.constructor.name).toBe("AsyncFunction");
  });

  it("returns { error } when no cart id is found", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce(null as never);
    const { applyPromotionAction } = await import("@/app/actions/cart");
    const result = await applyPromotionAction("SAVE10");
    expect(result).toEqual({ error: "No cart found" });
  });

  it("calls sdk.store.cart.update with the promo code", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_abc" as never);
    mockCartUpdate.mockResolvedValueOnce({ cart: { id: "cart_abc" } });
    vi.mocked(getEnrichedCart).mockResolvedValueOnce({
      cart: { id: "cart_abc", promotions: [{ code: "SAVE10" }] },
      issues: [],
      checkoutBlocked: false,
    } as never);

    const { applyPromotionAction } = await import("@/app/actions/cart");
    await applyPromotionAction("SAVE10");

    expect(mockCartUpdate).toHaveBeenCalledWith("cart_abc", {
      promo_codes: ["SAVE10"],
    });
  });

  it("returns the enriched cart on success", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_abc" as never);
    mockCartUpdate.mockResolvedValueOnce({ cart: { id: "cart_abc" } });
    const enriched = {
      cart: { id: "cart_abc", promotions: [{ code: "SAVE10" }] },
      issues: [],
      checkoutBlocked: false,
    };
    vi.mocked(getEnrichedCart).mockResolvedValueOnce(enriched as never);

    const { applyPromotionAction } = await import("@/app/actions/cart");
    const result = await applyPromotionAction("SAVE10");
    expect(result).toEqual({ cart: enriched });
  });

  it("returns { error } when the SDK throws", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_abc" as never);
    mockCartUpdate.mockRejectedValueOnce(new Error("Invalid promo code"));

    const { applyPromotionAction } = await import("@/app/actions/cart");
    const result = await applyPromotionAction("BADCODE");
    expect(result).toEqual({ error: "Invalid promo code" });
  });
});

describe("removePromotionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("is an exported async function", async () => {
    const { removePromotionAction } = await import("@/app/actions/cart");
    expect(typeof removePromotionAction).toBe("function");
    expect(removePromotionAction.constructor.name).toBe("AsyncFunction");
  });

  it("returns { error } when no cart id is found", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce(null as never);
    const { removePromotionAction } = await import("@/app/actions/cart");
    const result = await removePromotionAction("SAVE10");
    expect(result).toEqual({ error: "No cart found" });
  });

  it("calls sdk.store.cart.update with empty promo_codes", async () => {
    vi.mocked(getCartId).mockResolvedValueOnce("cart_abc" as never);
    mockCartUpdate.mockResolvedValueOnce({ cart: { id: "cart_abc" } });
    vi.mocked(getEnrichedCart).mockResolvedValueOnce({
      cart: { id: "cart_abc", promotions: [] },
      issues: [],
      checkoutBlocked: false,
    } as never);

    const { removePromotionAction } = await import("@/app/actions/cart");
    await removePromotionAction("SAVE10");

    expect(mockCartUpdate).toHaveBeenCalledWith("cart_abc", {
      promo_codes: [],
    });
  });
});
