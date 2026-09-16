/**
 * Render-contract tests for the NavBar (two-bar header, Row 2 — the main bar).
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 * Contract under test:
 *   - The search trigger lives in NavBar (moved from TopBar).
 *   - The cart trigger renders a SHOPPING CART (with wheels), not a bag.
 *   - The logo renders at 98px mobile / 135px desktop.
 *   - Main nav links use the underline active indicator.
 *   - The hamburger is xl-hidden; the nav links are xl-only.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for testing
const noop = () => {};

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/redux/store", () => ({
  useAppSelector: () => 0,
}));

vi.mock("@/app/context/CartSidebarModalContext", () => ({
  useCartModalContext: () => ({ openCartModal: noop }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ itemCount: 0, cart: null }),
}));

vi.mock("@/context/AuthContext", () => ({
  useCanSeePrices: () => true,
}));

vi.mock("@/context/StoreRegionContext", () => ({
  useStoreCurrency: () => "USD",
}));

vi.mock("@/config", () => ({
  default: {
    customerAccountsEnabled: false,
  },
}));

vi.mock("@/components/Product/GatedAmount", () => ({
  default: ({ amount }: { amount: number }) => <span>{amount}</span>,
}));

import { NavBar } from "./NavBar";

const NAVBAR_PROPS = {
  navigation: [
    { id: 1, title: "Home", path: "/", newTab: false },
    { id: 2, title: "Shop", path: "/shop", newTab: false },
  ],
  stickyMenu: false,
  siteSettings: {
    siteName: "Vulpy Commerce",
    logoUrl: "/images/logo.svg",
    supportPhone: "",
    searchPlaceholder: "Search products",
  },
  customer: null,
  navigationOpen: false,
  onToggleNavigation: noop,
  onOpenSearch: noop,
};

describe("NavBar — main bar", () => {
  it("exposes the search trigger that opens the overlay", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).toContain('aria-label="Open search"');
  });

  it("renders a shopping cart with wheels, not a bag", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    // The brief's cart SVG has two wheel circles at cy=20.
    expect(html).toContain('cx="9" cy="20"');
    expect(html).toContain('cx="18" cy="20"');
    expect(html).toContain("M3 3h2l.4 2M7 13h10l3-8H6.4");
  });

  it("renders the logo at 98px mobile / 135px desktop", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).toContain("h-auto w-[98px] lg:w-[135px]");
  });

  it("renders the main nav links", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).toContain("Home");
    expect(html).toContain('href="/shop"');
  });

  it("marks the active nav link with the underline indicator", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).toContain("bg-content-primary");
    expect(html).toContain("h-0.5");
  });

  it("keeps nav links xl-only and the hamburger xl-hidden", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).toContain("hidden xl:block");
    expect(html).toContain("xl:hidden");
    expect(html).toContain('aria-label="Menu"');
  });

  it("no longer renders the desktop inline search form", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).not.toContain('id="search-btn"');
  });

  it("renders 3-level nested flyout markup for submenu grandchildren", () => {
    const html = renderToStaticMarkup(
      <NavBar
        {...NAVBAR_PROPS}
        navigation={[
          {
            id: 10,
            title: "Levitating Objects",
            path: "/categories/levitating-objects",
            newTab: false,
            submenu: [
              {
                id: 11,
                title: "All Levitating Objects",
                path: "/categories/levitating-objects",
                newTab: false,
                mobileOnly: true,
              },
              {
                id: 12,
                title: "Paperweights",
                path: "/categories/paperweights",
                newTab: false,
                submenu: [
                  {
                    id: 13,
                    title: "Desk Paperweights",
                    path: "/categories/desk-paperweights",
                    newTab: false,
                  },
                  {
                    id: 14,
                    title: "Cabinet Paperweights",
                    path: "/categories/cabinet-paperweights",
                    newTab: false,
                  },
                ],
              },
            ],
          },
        ]}
      />
    );

    // Nested flyout panel class + reveal-on-hover of the sub group
    expect(html).toContain("dropdown-nested");
    // Right-chevron marker on the submenu parent (has children)
    expect(html).toContain("M5.67461 2.95363");
    // Grandchild labels render as real items, not "›" strings
    expect(html).toContain("Desk Paperweights");
    expect(html).toContain("Cabinet Paperweights");
  });
});
