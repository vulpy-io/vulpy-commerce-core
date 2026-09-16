/**
 * Unit tests for the payment-return polling logic.
 * Tests the pure pollPaymentReturn function and parseRedirectStatus helper.
 *
 * Runs in node environment — no DOM/React needed.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  type PollDeps,
  type PollResult,
  parseRedirectStatus,
  pollPaymentReturn,
} from "./payment-return-poller";

// ---------------------------------------------------------------------------
// parseRedirectStatus
// ---------------------------------------------------------------------------

describe("parseRedirectStatus", () => {
  it("returns 'failed' for 'failed'", () => {
    expect(parseRedirectStatus("failed")).toBe("failed");
  });

  it("returns 'failed' for 'canceled'", () => {
    expect(parseRedirectStatus("canceled")).toBe("failed");
  });

  it("returns 'poll' for 'succeeded'", () => {
    expect(parseRedirectStatus("succeeded")).toBe("poll");
  });

  it("returns 'poll' for null (missing)", () => {
    expect(parseRedirectStatus(null)).toBe("poll");
  });

  it("returns 'poll' for undefined", () => {
    expect(parseRedirectStatus(undefined)).toBe("poll");
  });

  it("returns 'poll' for unknown values", () => {
    expect(parseRedirectStatus("processing")).toBe("poll");
  });
});

// ---------------------------------------------------------------------------
// pollPaymentReturn
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<PollDeps> = {}): PollDeps {
  return {
    getCartId: vi.fn().mockResolvedValue("cart_123"),
    retrieveCart: vi.fn().mockResolvedValue({ cart: { id: "cart_123", completed_at: null } }),
    placeOrder: vi.fn().mockResolvedValue({ error: "not ready", recoverable: true }),
    delay: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("pollPaymentReturn — already completed cart", () => {
  it("returns success immediately when cart has completed_at", async () => {
    const deps = makeDeps({
      retrieveCart: vi.fn().mockResolvedValue({ cart: { id: "cart_123", completed_at: "2024-01-01T00:00:00Z" } }),
      placeOrder: vi.fn().mockResolvedValue({ status: "success", orderId: "order_abc" }),
    });

    const result = await pollPaymentReturn(deps);

    expect(result).toEqual<PollResult>({ outcome: "success", orderId: "order_abc" });
    // Should not delay on first attempt if already completed
    expect(deps.delay).not.toHaveBeenCalled();
  });
});

describe("pollPaymentReturn — placeOrder returns success on first attempt", () => {
  it("returns success with orderId", async () => {
    const deps = makeDeps({
      placeOrder: vi.fn().mockResolvedValue({ status: "success", orderId: "order_xyz" }),
    });

    const result = await pollPaymentReturn(deps);

    expect(result).toEqual<PollResult>({ outcome: "success", orderId: "order_xyz" });
    expect(deps.delay).not.toHaveBeenCalled();
  });
});

describe("pollPaymentReturn — placeOrder returns already_completed on first attempt", () => {
  it("returns success with empty orderId (already completed, order retrieval needed externally)", async () => {
    const deps = makeDeps({
      placeOrder: vi.fn().mockResolvedValue({ status: "already_completed" }),
    });

    const result = await pollPaymentReturn(deps);

    expect(result.outcome).toBe("success");
  });
});

describe("pollPaymentReturn — retries on error", () => {
  it("retries after delay and succeeds on second attempt", async () => {
    let calls = 0;
    const deps = makeDeps({
      placeOrder: vi.fn().mockImplementation(() => {
        calls++;
        if (calls < 2) {
          return Promise.resolve({ error: "not ready", recoverable: true });
        }
        return Promise.resolve({ status: "success", orderId: "order_late" });
      }),
    });

    const result = await pollPaymentReturn(deps);

    expect(result).toEqual<PollResult>({ outcome: "success", orderId: "order_late" });
    expect(deps.delay).toHaveBeenCalledTimes(1);
  });

  it("uses fibonacci-ish delays (first delay is 1000ms, second is 2000ms)", async () => {
    const capturedDelays: number[] = [];
    let callCount = 0;
    const deps = makeDeps({
      placeOrder: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({ error: "not ready", recoverable: true });
        }
        return Promise.resolve({ status: "success", orderId: "order_late" });
      }),
      delay: vi.fn().mockImplementation((ms: number) => {
        capturedDelays.push(ms);
        return Promise.resolve();
      }),
    });

    await pollPaymentReturn(deps);

    expect(capturedDelays[0]).toBe(1000);
    expect(capturedDelays[1]).toBe(2000);
  });
});

describe("pollPaymentReturn — timeout after MAX_ATTEMPTS", () => {
  it(`returns timeout after ${MAX_ATTEMPTS} failed attempts`, async () => {
    const deps = makeDeps({
      placeOrder: vi.fn().mockResolvedValue({ error: "not ready", recoverable: true }),
    });

    const result = await pollPaymentReturn(deps);

    expect(result).toEqual<PollResult>({ outcome: "timeout" });
    expect(deps.placeOrder).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    // Should delay MAX_ATTEMPTS - 1 times (no delay after last attempt)
    expect(deps.delay).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
  });

  it("never says 'payment failed' on timeout — only 'timeout' outcome", async () => {
    const deps = makeDeps({
      placeOrder: vi.fn().mockResolvedValue({ error: "not ready", recoverable: true }),
    });

    const result = await pollPaymentReturn(deps);

    // The result itself must not contain any failure claim
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("failed");
    expect(resultStr).not.toContain("failure");
  });
});

describe("pollPaymentReturn — cart not found", () => {
  it("returns timeout when cartId is null (no cookie)", async () => {
    const deps = makeDeps({
      getCartId: vi.fn().mockResolvedValue(null),
    });

    const result = await pollPaymentReturn(deps);

    expect(result).toEqual<PollResult>({ outcome: "timeout" });
    expect(deps.retrieveCart).not.toHaveBeenCalled();
  });

  it("does NOT use cartId from URL params — relies on cookie only", async () => {
    // The function only calls getCartId() (cookie-based), never receives URL params
    const deps = makeDeps({
      getCartId: vi.fn().mockResolvedValue("cart_from_cookie"),
    });

    await pollPaymentReturn(deps);

    expect(deps.getCartId).toHaveBeenCalledTimes(1);
    // retrieveCart is called with the cookie-based cart id, not any URL param
    expect(deps.retrieveCart).toHaveBeenCalledWith("cart_from_cookie");
  });
});

describe("pollPaymentReturn — retrieveCart throws", () => {
  it("treats retrieval errors as retry-worthy", async () => {
    let callCount = 0;
    const deps = makeDeps({
      retrieveCart: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error("network error"));
        }
        return Promise.resolve({ cart: { id: "cart_123", completed_at: null } });
      }),
      placeOrder: vi.fn().mockResolvedValue({ status: "success", orderId: "order_ok" }),
    });

    const result = await pollPaymentReturn(deps);

    expect(result).toEqual<PollResult>({ outcome: "success", orderId: "order_ok" });
  });
});

describe("pollPaymentReturn — NEXT_REDIRECT re-throw", () => {
  it("re-throws errors with NEXT_REDIRECT digest from placeOrder", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/order/confirmed/order_abc;303;",
    });
    const deps = makeDeps({
      placeOrder: vi.fn().mockRejectedValue(redirectError),
    });

    await expect(pollPaymentReturn(deps)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("re-throws NEXT_REDIRECT from retrieveCart", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/somewhere;303;",
    });
    const deps = makeDeps({
      retrieveCart: vi.fn().mockRejectedValue(redirectError),
    });

    await expect(pollPaymentReturn(deps)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("does NOT re-throw ordinary errors — retries instead", async () => {
    let calls = 0;
    const deps = makeDeps({
      placeOrder: vi.fn().mockImplementation(() => {
        calls++;
        if (calls < 2) {
          return Promise.reject(new Error("network flake"));
        }
        return Promise.resolve({ status: "success", orderId: "order_ok" });
      }),
    });

    const result = await pollPaymentReturn(deps);
    expect(result).toEqual<PollResult>({ outcome: "success", orderId: "order_ok" });
  });
});
