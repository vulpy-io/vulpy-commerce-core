/**
 * Unit tests for PaymentReturnPoller analytics instrumentation.
 *
 * Tests the exported handlePollResult helper that applies the
 * "success → fire payment_success event" logic, separated from the
 * React component so it can run in the node environment without jsdom.
 */
import { describe, expect, it, vi } from "vitest";

// Mock transitive imports pulled in by the component module
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/app/actions/order", () => ({ placeOrderAction: vi.fn() }));
vi.mock("@/context/ConsentContext", () => ({ useHasAnalyticsConsent: vi.fn(() => false) }));
vi.mock("@/lib/analytics", () => ({
  trackCustomEvent: vi.fn(),
  submitBeginCheckout: vi.fn(),
  submitAddShippingInfo: vi.fn(),
  submitAddPaymentInfo: vi.fn(),
  paymentProviderCategory: vi.fn(),
}));
vi.mock("@/lib/medusa/client", () => ({ getMedusaClient: vi.fn() }));
vi.mock("@/lib/medusa/cookies", () => ({ getCartId: vi.fn() }));
vi.mock("@/lib/medusa/payment-return-poller", () => ({
  pollPaymentReturn: vi.fn(),
  DELAYS: [1000, 2000, 3000, 5000, 8000, 13_000],
  MAX_ATTEMPTS: 6,
}));

import { handlePollResult, PaymentFailureTracker } from "./PaymentReturnPoller";

describe("handlePollResult — analytics", () => {
  it("fires payment_success event when outcome is success and hasAnalytics is true", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "success", orderId: "order_abc" },
      { hasAnalytics: true, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("Checkout", "payment_success", "stripe_return");
  });

  it("does NOT fire event when outcome is success and hasAnalytics is false", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "success", orderId: "order_abc" },
      { hasAnalytics: false, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("does NOT fire event on timeout", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "timeout" },
      { hasAnalytics: true, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("redirects to /order/confirmed/{orderId} on success with orderId", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "success", orderId: "order_xyz" },
      { hasAnalytics: false, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockRouter.replace).toHaveBeenCalledWith("/order/confirmed/order_xyz");
  });

  it("redirects to /my-account when already_completed with empty orderId", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "success", orderId: "" },
      { hasAnalytics: false, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockRouter.replace).toHaveBeenCalledWith("/my-account");
  });
});

describe("handlePollResult — dedup via submitPaymentSuccessOnce", () => {
  it("fires payment_success event when hasAnalytics is true and orderId not seen before", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "success", orderId: "order_dedup_1" },
      { hasAnalytics: true, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockTrack).toHaveBeenCalledWith("Checkout", "payment_success", "stripe_return");
  });

  it("does NOT fire payment_success twice for same orderId (dedup guard)", () => {
    const mockTrack = vi.fn();
    const mockRouter = { replace: vi.fn() };

    handlePollResult(
      { outcome: "success", orderId: "order_dedup_2" },
      { hasAnalytics: true, trackEvent: mockTrack, router: mockRouter as never }
    );
    handlePollResult(
      { outcome: "success", orderId: "order_dedup_2" },
      { hasAnalytics: true, trackEvent: mockTrack, router: mockRouter as never }
    );

    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});

describe("PaymentFailureTracker — 3DS failure analytics", () => {
  it("exports PaymentFailureTracker as a defined value (client component)", () => {
    // PaymentFailureTracker is a client component exported from the module.
    // We verify it is exported and callable/truthy via the static import at
    // the top of this test file.
    expect(PaymentFailureTracker).toBeDefined();
  });
});
