/**
 * Render-contract tests for NavActiveIndicator — the active-indicator for
 * header navigation links.
 * Contract under test:
 *   - `variant="dot"` renders the legacy orange dot (dropdown sub-items).
 *   - `variant="underline"` (default) renders the 2px content-primary
 *     underline for main-nav links.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavActiveIndicator } from "./NavActiveIndicator";

describe("NavActiveIndicator", () => {
  it("defaults to the underline variant for main-nav links", () => {
    const html = renderToStaticMarkup(
      <NavActiveIndicator position="left" visible />,
    );
    expect(html).toContain("bg-content-primary");
    expect(html).toContain("h-0.5");
    expect(html).not.toContain("rounded-full");
  });

  it("renders the orange dot for the legacy variant", () => {
    const html = renderToStaticMarkup(
      <NavActiveIndicator position="left" variant="dot" visible />,
    );
    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-action-primary-background");
  });

  it("renders the underline on the bottom edge (inset-x-0 bottom-0)", () => {
    const html = renderToStaticMarkup(
      <NavActiveIndicator position="left" visible />,
    );
    expect(html).toContain("bottom-0");
    expect(html).toContain("inset-x-0");
  });

  it("supports a text-width mobile underline", () => {
    const html = renderToStaticMarkup(
      <NavActiveIndicator mobileFit position="left" visible />,
    );
    expect(html).toContain("w-full");
    expect(html).toContain("left-0");
    expect(html).not.toContain("inset-x-0");
  });
});
