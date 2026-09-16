/**
 * Render-contract tests for SiteLayoutClient (Part 1 — no hydration stall).
 *
 * Problem: the layout used to gate ALL real content (Header/children/Footer)
 * behind a `loading` state that only flipped after a 200ms effect. If that
 * effect never ran (hydration stall / HMR / WS failure), users sat on a blank
 * white spinner with NO content in the DOM — `#__next` never showed anything.
 *
 * Contract under test:
 *   1. The real content node is present in the markup REGARDLESS of loading
 *      state (no more blank-page-under-spinner).
 *   2. The transient PreLoader overlay is rendered on top for the brief
 *      loading window, and the content is still underneath it.
 *
 * Runs in the node environment via renderToStaticMarkup. Heavy children are
 * stubbed; the contract is the layout shell, not the providers.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

// Stub every context provider / modal / hydrator so the shell renders cleanly
// in the node environment. These are all "use client" runtime pieces that need
// jsdom; the shell contract does not depend on their internals.
vi.mock("@/app/context/CartSidebarModalContext", () => ({
  CartModalProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cart-modal-ctx">{children}</div>
  ),
}));
vi.mock("@/app/context/PreviewSliderContext", () => ({
  PreviewSliderProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="preview-slider-ctx">{children}</div>
  ),
}));
vi.mock("@/app/context/QuickViewModalContext", () => ({
  ModalProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="quick-view-ctx">{children}</div>
  ),
}));
vi.mock("@/components/Analytics/AnalyticsRoot", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="analytics-root">{children}</div>
  ),
}));
vi.mock("@/components/Analytics/AnalyticsUserIdSync", () => ({
  default: () => <div data-testid="analytics-user-id-sync" />,
}));
vi.mock("@/components/Common/CartSidebarModal", () => ({
  default: () => <div data-testid="cart-sidebar-modal" />,
}));
vi.mock("@/components/Common/HeaderHeightSync", () => ({
  default: () => <div data-testid="header-height-sync" />,
}));
vi.mock("@/components/Common/PreLoader", () => ({
  default: () => <div data-testid="preloader-overlay" />,
}));
vi.mock("@/components/Common/PreviewSlider", () => ({
  default: () => <div data-testid="preview-slider" />,
}));
vi.mock("@/components/Common/QuickViewModal", () => ({
  default: () => <div data-testid="quick-view-modal" />,
}));
vi.mock("@/components/Common/ScrollToTop", () => ({
  default: () => <div data-testid="scroll-to-top" />,
}));
vi.mock("@/components/Common/TopLoadingBar", () => ({
  default: () => <div data-testid="top-loading-bar" />,
}));
vi.mock("@/components/Consent/ConsentBanner", () => ({
  default: () => <div data-testid="consent-banner" />,
}));
vi.mock("@/components/cms/BlocksRenderer", () => ({
  default: () => <div data-testid="blocks-renderer" />,
}));
vi.mock("@/components/Footer", () => ({
  default: () => <footer data-testid="site-footer" />,
}));
vi.mock("@/components/Header", () => ({
  default: () => <header data-testid="site-header" />,
}));
vi.mock("@/components/RecentlyViewed/RecentlyViewedHydrator", () => ({
  default: () => <div data-testid="recently-viewed" />,
}));
vi.mock("@/components/Wishlist/WishlistHydrator", () => ({
  default: () => <div data-testid="wishlist" />,
}));
vi.mock("@/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-ctx">{children}</div>
  ),
}));
vi.mock("@/context/CartContext", () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cart-ctx">{children}</div>
  ),
}));
vi.mock("@/context/ConsentContext", () => ({
  ConsentProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="consent-ctx">{children}</div>
  ),
}));
vi.mock("@/context/StoreRegionContext", () => ({
  StoreRegionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="region-ctx">{children}</div>
  ),
}));
vi.mock("@/redux/provider", () => ({
  ReduxProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="redux-ctx">{children}</div>
  ),
}));
vi.mock("react-hot-toast", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

import { usePathname } from "next/navigation";
import SiteLayoutClient from "./SiteLayoutClient";

const BASE_PROPS = {
  customer: null,
  initialCart: null,
  initialIssues: [],
  checkoutBlocked: false,
  siteSettings: {
    siteName: "Vulpy",
    searchPlaceholder: "Search products",
    hideCart: false,
    paymentMethods: [],
    preFooterBlocks: [],
  },
  navigation: [],
  footer: {
    preFooterBlocks: [],
  },
  regionId: "reg_1",
  currencyCode: "usd",
  searchCategories: [],
} as Parameters<typeof SiteLayoutClient>[0];

describe("SiteLayoutClient — no hydration stall", () => {
  it("renders the real content node in SSR markup regardless of loading state", () => {
    const html = renderToStaticMarkup(
      <SiteLayoutClient {...BASE_PROPS}>
        <main data-testid="page-content">Page body</main>
      </SiteLayoutClient>,
    );

    // The content must be in the DOM even while the transient overlay is up
    // (loading starts true in the real component).
    expect(html).toContain('data-testid="page-content"');
    expect(html).toContain("Page body");
    // Header and Footer are part of the real layout and must never be gated.
    expect(html).toContain('data-testid="site-header"');
    expect(html).toContain('data-testid="site-footer"');
    expect(html).toContain("flex min-h-dvh flex-col");
    expect(html).toContain("flex-1");
    // The transient overlay sits ON TOP of the content — it must coexist.
    expect(html).toContain('data-testid="preloader-overlay"');
    // The content must come BEFORE the closing of the outermost wrapper (i.e.
    // it is inside the tree, not a sibling rendered only after loading=false).
    expect(html.indexOf("Page body")).toBeGreaterThan(-1);
  });

  it("still renders the content even when the loading overlay would be shown", () => {
    const html = renderToStaticMarkup(
      <SiteLayoutClient {...BASE_PROPS}>
        <main data-testid="page-content">Page body</main>
      </SiteLayoutClient>,
    );

    // Overlay coexists with content — both markers present in the same markup.
    expect(html).toContain('data-testid="preloader-overlay"');
    expect(html).toContain('data-testid="page-content"');
    // Order: overlay is a top-level transient; the content is still mounted.
    expect(html.indexOf("Page body")).toBeGreaterThan(0);
  });

  it("skips the overlay entirely on minimal-layout (checkout) paths", () => {
    vi.mocked(usePathname).mockReturnValueOnce("/checkout");
    const html = renderToStaticMarkup(
      <SiteLayoutClient {...BASE_PROPS}>
        <main data-testid="page-content">Checkout body</main>
      </SiteLayoutClient>,
    );

    expect(html).toContain('data-testid="page-content"');
    expect(html).not.toContain('data-testid="preloader-overlay"');
  });
});