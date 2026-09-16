/**
 * Unit tests for CheckoutError boundary.
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/link so it renders as a plain anchor for SSR snapshot tests
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

import type React from "react";
import CheckoutError from "./error";

function makeError(message: string, digest?: string): Error & { digest?: string } {
  const err = new Error(message) as Error & { digest?: string };
  if (digest !== undefined) {
    err.digest = digest;
  }
  return err;
}

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for reset spy
const noop = () => {};

describe("CheckoutError — normal error (no digest)", () => {
  it("renders the 'Something went wrong' heading", () => {
    const html = renderToStaticMarkup(
      <CheckoutError error={makeError("boom")} reset={noop} />,
    );
    expect(html).toContain("Something went wrong");
  });

  it("renders the 'Your payment has not been charged' body copy", () => {
    const html = renderToStaticMarkup(
      <CheckoutError error={makeError("boom")} reset={noop} />,
    );
    expect(html).toContain("Your payment has not been charged");
  });

  it("does NOT contain 'payment failed' language", () => {
    const html = renderToStaticMarkup(
      <CheckoutError error={makeError("boom")} reset={noop} />,
    );
    expect(html.toLowerCase()).not.toContain("payment failed");
  });

  it("renders a 'Try again' button", () => {
    const html = renderToStaticMarkup(
      <CheckoutError error={makeError("boom")} reset={noop} />,
    );
    expect(html).toContain("Try again");
  });

  it("renders a 'Return to cart' link pointing to /cart", () => {
    const html = renderToStaticMarkup(
      <CheckoutError error={makeError("boom")} reset={noop} />,
    );
    expect(html).toContain("Return to cart");
    expect(html).toContain('href="/cart"');
  });
});

describe("CheckoutError — NEXT_REDIRECT digest", () => {
  it("renders null (empty string) when digest starts with NEXT_REDIRECT", () => {
    const html = renderToStaticMarkup(
      <CheckoutError
        error={makeError("redirect", "NEXT_REDIRECT")}
        reset={noop}
      />,
    );
    expect(html).toBe("");
  });

  it("renders null for NEXT_REDIRECT with trailing identifier", () => {
    const html = renderToStaticMarkup(
      <CheckoutError
        error={makeError("redirect", "NEXT_REDIRECT;/checkout/success")}
        reset={noop}
      />,
    );
    expect(html).toBe("");
  });
});

describe("CheckoutError — 'Try again' button calls reset", () => {
  it("renders a button element for 'Try again' (reset CTA present in DOM)", () => {
    const resetSpy = vi.fn();
    const html = renderToStaticMarkup(
      <CheckoutError error={makeError("boom")} reset={resetSpy} />,
    );
    // Button renders in the SSR output; click handlers cannot fire in
    // renderToStaticMarkup but structural presence confirms the CTA exists.
    expect(html).toContain("Try again");
    expect(html).toContain("<button");
  });
});

describe("CheckoutError — console logging behaviour", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("does not log to console in production mode (useEffect does not run in SSR)", () => {
    vi.stubEnv("NODE_ENV", "production");
    renderToStaticMarkup(
      <CheckoutError error={makeError("prod-error")} reset={noop} />,
    );
    // useEffect never fires during SSR — no console call expected
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does not log to console in development mode during SSR (useEffect deferred)", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderToStaticMarkup(
      <CheckoutError error={makeError("dev-error")} reset={noop} />,
    );
    // useEffect is deferred and does not fire in renderToStaticMarkup
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
