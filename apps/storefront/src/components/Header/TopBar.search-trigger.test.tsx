/**
 * Render-contract tests for the header search trigger migration.
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 *
 * The two-bar header moved the search trigger from TopBar (old single-bar
 * layout) into NavBar (Row 2, the main bar). TopBar is now the desktop-only
 * utility strip and must NOT expose the search control; NavBar must.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for testing
const noop = () => {};

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: noop, replace: noop }),
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
import { TopBar } from "./TopBar";

const SITE_SETTINGS = {
  siteName: "Vulpy Commerce",
  logoUrl: "/images/logo.svg",
  supportPhone: "+1 555 000 0000",
  searchPlaceholder: "Search products",
  topBarText: "Small-batch objects, delivered worldwide",
  topBarLinks: [{ label: "Contact", url: "/contact" }],
};

const NAVBAR_PROPS = {
  navigation: [{ id: 1, title: "Home", path: "/", newTab: false }],
  stickyMenu: false,
  siteSettings: SITE_SETTINGS,
  customer: null,
  navigationOpen: false,
  onToggleNavigation: noop,
  onOpenSearch: noop,
};

const TOPBAR_PROPS = {
  siteSettings: SITE_SETTINGS,
};

describe("Header — search trigger lives in NavBar", () => {
  it("NavBar exposes the accessible Open search control", () => {
    const html = renderToStaticMarkup(<NavBar {...NAVBAR_PROPS} />);
    expect(html).toContain('aria-label="Open search"');
  });

  it("TopBar no longer exposes the search control", () => {
    const html = renderToStaticMarkup(<TopBar {...TOPBAR_PROPS} />);
    expect(html).not.toContain('aria-label="Open search"');
    expect(html).not.toContain('id="search-btn"');
  });
});
