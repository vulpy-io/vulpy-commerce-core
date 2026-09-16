/**
 * Render-contract tests for the TopBar utility strip (two-bar header, Row 1).
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 * Contract under test: the desktop-only utility strip renders the tagline
 * (topBarText) on the left and the topBarLinks on the right, on the footer
 * background — and carries none of the old phone/search chrome (those moved
 * to NavBar or were removed).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for testing
const noop = () => {};

/** Matches any class attribute that includes the `hidden` utility. */
const HIDDEN_CLASS_REGEX = /class="[^"]*\bhidden\b[^"]*"/;

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: noop, replace: noop }),
}));

import { TopBar } from "./TopBar";

const TOPBAR_PROPS = {
  siteSettings: {
    siteName: "Vulpy Commerce",
    logoUrl: "/images/logo.svg",
    supportPhone: "+1 555 000 0000",
    searchPlaceholder: "Search products",
    topBarText: "Small-batch objects, delivered worldwide",
    topBarLinks: [
      { label: "Blog", url: "/blog" },
      { label: "Contact", url: "/contact" },
    ],
  },
};

describe("TopBar — utility strip", () => {
  it("renders the tagline text", () => {
    const html = renderToStaticMarkup(<TopBar {...TOPBAR_PROPS} />);
    expect(html).toContain("Small-batch objects, delivered worldwide");
  });

  it("renders the top bar links with their hrefs", () => {
    const html = renderToStaticMarkup(<TopBar {...TOPBAR_PROPS} />);
    expect(html).toContain("Blog");
    expect(html).toContain('href="/blog"');
    expect(html).toContain("Contact");
    expect(html).toContain('href="/contact"');
  });

  it("is desktop-only on the footer background", () => {
    const html = renderToStaticMarkup(<TopBar {...TOPBAR_PROPS} />);
    // Hidden below lg, visible at lg+ (both classes present on the strip).
    expect(html).toMatch(HIDDEN_CLASS_REGEX);
    expect(html).toContain("lg:block");
    expect(html).toContain("bg-footer-background");
  });

  it("no longer renders the phone/call section", () => {
    const html = renderToStaticMarkup(<TopBar {...TOPBAR_PROPS} />);
    expect(html).not.toContain("Call us");
    expect(html).not.toContain("+1 555 000 0000");
  });

  it("renders nothing when the tagline and links are absent", () => {
    const html = renderToStaticMarkup(
      <TopBar
        siteSettings={{
          siteName: "Vulpy Commerce",
          logoUrl: "/images/logo.svg",
          supportPhone: "",
          searchPlaceholder: "",
        }}
      />,
    );
    // Strip is still mounted (desktop-only wrapper) but carries no utility copy.
    expect(html).toMatch(HIDDEN_CLASS_REGEX);
    expect(html).not.toContain("Small-batch objects");
  });
});
