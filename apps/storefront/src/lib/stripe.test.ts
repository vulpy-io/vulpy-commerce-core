/**
 * Tests for lib/stripe.ts
 *
 * Verifies the module exports stripePromise, which is either a thenable
 * (Promise<Stripe>) when NEXT_PUBLIC_STRIPE_KEY is set, or null when it is not.
 *
 * loadStripe is a browser-side async loader — we mock @stripe/stripe-js so tests
 * run cleanly in the node environment without a real Stripe connection.
 *
 * Module-level evaluation means stripePromise is computed once at import time.
 * These tests verify the contract: when a key is provided, a promise is returned;
 * the export is always null or a thenable — never an unexpected type.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn((key: string) => Promise.resolve({ type: "stripe", key } as never)),
}));

describe("lib/stripe — stripePromise export", () => {
  it("module exports a stripePromise symbol", async () => {
    const mod = await import("./stripe");
    expect(Object.hasOwn(mod, "stripePromise")).toBe(true);
  });

  it("stripePromise is either null or a thenable — never another type", async () => {
    const { stripePromise } = await import("./stripe");
    const isNullOrThenable =
      stripePromise === null ||
      (typeof stripePromise === "object" && stripePromise !== null && typeof (stripePromise as Promise<unknown>).then === "function");
    expect(isNullOrThenable).toBe(true);
  });

  it("loadStripe is called with the env key when NEXT_PUBLIC_STRIPE_KEY is set at module load", async () => {
    // Reset module registry so we can re-evaluate with a known key
    vi.resetModules();
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
    process.env.NEXT_PUBLIC_STRIPE_KEY = "pk_test_unit_test_key";

    const { loadStripe } = await import("@stripe/stripe-js");
    await import("./stripe");

    expect(loadStripe).toHaveBeenCalledWith("pk_test_unit_test_key");

    // Restore
    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });

  it("stripePromise is null when NEXT_PUBLIC_STRIPE_KEY is empty string", async () => {
    vi.resetModules();
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
    process.env.NEXT_PUBLIC_STRIPE_KEY = "";

    const { stripePromise } = await import("./stripe");
    // Empty string is falsy — loadStripe should not be called, promise should be null
    expect(stripePromise).toBeNull();

    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });
});

describe("lib/stripe — dev-only preflight warning", () => {
  it("logs a console.warn when NODE_ENV=development and key does not start with pk_test_ or pk_live_", async () => {
    vi.resetModules();
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
    // @ts-expect-error — NODE_ENV is normally read-only in prod; writable in test
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_STRIPE_KEY = "sk_test_this_is_a_secret_key";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });

    await import("./stripe");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_STRIPE_KEY does not look like a valid Stripe publishable key")
    );
    // Must NOT log the key value itself
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk_test_this_is_a_secret_key"));

    warnSpy.mockRestore();
    // @ts-expect-error — same as above
    process.env.NODE_ENV = originalEnv;
    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });

  it("does NOT warn when NODE_ENV=development and key starts with pk_test_", async () => {
    vi.resetModules();
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
    // @ts-expect-error
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_STRIPE_KEY = "pk_test_valid_key";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });

    await import("./stripe");

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_STRIPE_KEY")
    );

    warnSpy.mockRestore();
    // @ts-expect-error
    process.env.NODE_ENV = originalEnv;
    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });

  it("does NOT warn when NODE_ENV=development and key starts with pk_live_", async () => {
    vi.resetModules();
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
    // @ts-expect-error
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_STRIPE_KEY = "pk_live_valid_key";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });

    await import("./stripe");

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_STRIPE_KEY")
    );

    warnSpy.mockRestore();
    // @ts-expect-error
    process.env.NODE_ENV = originalEnv;
    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });

  it("does NOT warn in production even with a bad key", async () => {
    vi.resetModules();
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;
    // @ts-expect-error
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_STRIPE_KEY = "bad_key_value";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });

    await import("./stripe");

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    // @ts-expect-error
    process.env.NODE_ENV = originalEnv;
    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });
});
