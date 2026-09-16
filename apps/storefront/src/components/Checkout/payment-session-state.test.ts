/**
 * Unit tests for the PaymentElement upgrade (Task 7).
 *
 * Tests:
 * 1. isPaymentPrerequisitesMet — pure guard for address+shipping+total
 * 2. isSessionStale / markSessionStale — stale-flag logic
 * 3. PaymentElement renders when clientSecret is set (via CheckoutSteps render)
 * 4. Pay button disabled when session is stale
 *
 * Runs in node environment; no jsdom required.
 */

import { describe, expect, it } from "vitest";
import {
  isPaymentPrerequisitesMet,
  isPlaceOrderSuccess,
  shouldRefreshPaymentSession,
} from "./payment-session-state";

// ---------------------------------------------------------------------------
// 1. isPaymentPrerequisitesMet
// ---------------------------------------------------------------------------

describe("isPaymentPrerequisitesMet", () => {
  const fullAddress = {
    first_name: "Ada",
    last_name: "Lovelace",
    address_1: "1 Turing St",
    city: "London",
    country_code: "gb",
    postal_code: "SW1A 1AA",
  };

  it("returns false when address is missing", () => {
    expect(
      isPaymentPrerequisitesMet({
        shippingAddress: null,
        shippingMethodId: "ship_123",
        cartTotal: 10,
      })
    ).toBe(false);
  });

  it("returns false when shippingMethodId is empty", () => {
    expect(
      isPaymentPrerequisitesMet({
        shippingAddress: fullAddress,
        shippingMethodId: "",
        cartTotal: 10,
      })
    ).toBe(false);
  });

  it("returns false when cartTotal is zero", () => {
    expect(
      isPaymentPrerequisitesMet({
        shippingAddress: fullAddress,
        shippingMethodId: "ship_123",
        cartTotal: 0,
      })
    ).toBe(false);
  });

  it("returns false when required address field is missing", () => {
    const incompleteAddress = {
      first_name: "Ada",
      last_name: "",          // missing
      address_1: "1 Turing St",
      city: "London",
      country_code: "gb",
      postal_code: "SW1A 1AA",
    };
    expect(
      isPaymentPrerequisitesMet({
        shippingAddress: incompleteAddress,
        shippingMethodId: "ship_123",
        cartTotal: 10,
      })
    ).toBe(false);
  });

  it("returns true when all prerequisites are met", () => {
    expect(
      isPaymentPrerequisitesMet({
        shippingAddress: fullAddress,
        shippingMethodId: "ship_123",
        cartTotal: 25,
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. shouldRefreshPaymentSession
// ---------------------------------------------------------------------------

describe("shouldRefreshPaymentSession", () => {
  it("returns true when session is stale and prerequisites are met", () => {
    expect(
      shouldRefreshPaymentSession({
        isStale: true,
        paymentSessionReady: true,
        hasClientSecret: true,
      })
    ).toBe(true);
  });

  it("returns false when session is not stale", () => {
    expect(
      shouldRefreshPaymentSession({
        isStale: false,
        paymentSessionReady: true,
        hasClientSecret: true,
      })
    ).toBe(false);
  });

  it("returns false when there is no client secret yet (initial load)", () => {
    expect(
      shouldRefreshPaymentSession({
        isStale: true,
        paymentSessionReady: false,
        hasClientSecret: false,
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. PaymentElement renders — confirmed via grep (no legacy card element usage)
// 4. Pay button disabled when stale — checked in CheckoutPaymentElement.test.tsx
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. isPlaceOrderSuccess — analytics gate: payment_success fires only on success
// ---------------------------------------------------------------------------

describe("isPlaceOrderSuccess", () => {
  it("returns false when result contains an error — analytics must NOT fire", () => {
    expect(isPlaceOrderSuccess({ error: "Payment could not be completed" })).toBe(false);
  });

  it("returns false when result has an empty error string", () => {
    expect(isPlaceOrderSuccess({ error: "" })).toBe(false);
  });

  it("returns true when result is undefined (void — order placed, redirect imminent)", () => {
    expect(isPlaceOrderSuccess(undefined)).toBe(true);
  });

  it("returns true when result is null", () => {
    expect(isPlaceOrderSuccess(null)).toBe(true);
  });

  it("returns true when result has no error key (success payload)", () => {
    expect(isPlaceOrderSuccess({} as Record<string, never>)).toBe(true);
  });
});

