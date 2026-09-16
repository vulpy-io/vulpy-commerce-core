/**
 * Render-contract tests for ProductItem swatch-row gating.
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 * Contract under test:
 *   - Products with ZERO distinct finishes render NO swatch row.
 *   - Products with ONE distinct finish render NO swatch row (single color is
 *     the product's own color, not a choice — showing it is noise).
 *   - Products with TWO+ distinct finishes render the swatch row
 *     (opacity-0 group-hover:opacity-100) with one swatch button per finish.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

// ProductItem pulls in client-only contexts (redux, cart, consent, analytics).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
}));
vi.mock("@/app/context/QuickViewModalContext", () => ({
  useModalContext: () => ({ openModal: vi.fn() }),
}));
vi.mock("@/components/Product/FinishSwatch", () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock("@/components/Product/ProductPrice", () => ({
  default: () => null,
}));
vi.mock("@/components/Product/ProductSaleBadge", () => ({
  default: () => null,
}));
vi.mock("@/components/Product/ProductStoreTagBadges", () => ({
  default: () => null,
}));
vi.mock("@/components/Product/WishlistButton", () => ({
  default: () => null,
}));
vi.mock("@/context/AuthContext", () => ({
  useCanSeePrices: () => false,
  usePricePersona: () => "retail",
}));
vi.mock("@/context/ConsentContext", () => ({
  useHasAnalyticsConsent: () => false,
}));
vi.mock("@/context/StoreRegionContext", () => ({
  useStoreCurrency: () => "usd",
}));
vi.mock("@/hooks/useAddToCart", () => ({
  useAddToCart: () => ({ addToCart: vi.fn() }),
}));
vi.mock("@/hooks/usePrefetchOnIntent", () => ({
  usePrefetchOnIntent: () => ({}),
}));
vi.mock("@/hooks/useWishlistToggle", () => ({
  useWishlistToggle: () => ({ isInWishlist: false, toggle: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({
  trackProductImpression: vi.fn(),
  trackSelectItem: vi.fn(),
}));
vi.mock("@/lib/medusa/asset-url", () => ({
  PRODUCT_PLACEHOLDER_IMAGE: "/placeholder.png",
}));
vi.mock("@/lib/medusa/money", () => ({
  hasPriceRange: vi.fn(() => false),
}));
vi.mock("@/lib/medusa/persona", () => ({
  resolveAddCta: vi.fn(() => "none"),
}));
vi.mock("@/redux/features/product-details", () => ({
  updateproductDetails: vi.fn(),
}));
vi.mock("@/redux/features/quickView-slice", () => ({
  updateQuickView: vi.fn(),
}));
vi.mock("@/redux/store", () => ({
  useAppSelector: () => 0,
}));

import ProductItem from "./ProductItem";

function baseProduct(finishes: string[]): Product {
  return {
    id: "prod_1",
    title: "Test Product",
    reviews: 0,
    price: 10,
    discountedPrice: 0,
    finishes,
  } as Product;
}

function renderSwatchArea(finishes: string[]): string {
  const html = renderToStaticMarkup(
    <ProductItem item={baseProduct(finishes)} regionId="reg_1" />,
  );
  // The swatch row is the only use of this class pattern on the card.
  const marker = "lg:opacity-0 lg:group-hover:opacity-100";
  const start = html.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const before = html.lastIndexOf("<div", start);
  const after = html.indexOf("/div>", start);
  return before === -1 || after === -1 ? "" : html.slice(before, after + 5);
}

describe("ProductItem swatch row", () => {
  it("renders NO swatch row when the product has one distinct finish", () => {
    const html = renderToStaticMarkup(
      <ProductItem item={baseProduct(["Black"])} regionId="reg_1" />,
    );
    expect(html).not.toContain("lg:opacity-0 lg:group-hover:opacity-100");
    expect(html).not.toContain("View Test Product in");
  });

  it("renders NO swatch row when the product has no finishes", () => {
    const html = renderToStaticMarkup(
      <ProductItem item={baseProduct([])} regionId="reg_1" />,
    );
    expect(html).not.toContain("lg:opacity-0 lg:group-hover:opacity-100");
    expect(html).not.toContain("View Test Product in");
  });

  it("renders the swatch row with one button per finish when there are two+", () => {
    const html = renderToStaticMarkup(
      <ProductItem item={baseProduct(["Black", "Ivory"])} regionId="reg_1" />,
    );
    expect(html).toContain("lg:opacity-0 lg:group-hover:opacity-100");
    expect(html).toContain("opacity-100 transition-opacity");
    expect(html).toContain("View Test Product in Black");
    expect(html).toContain("View Test Product in Ivory");
    expect(html.match(/View Test Product in /g)).toHaveLength(2);
  });

  it("keeps swatches visible below lg (always visible when no hover)", () => {
    const html = renderToStaticMarkup(
      <ProductItem item={baseProduct(["Black", "Ivory"])} regionId="reg_1" />,
    );
    const area = renderSwatchArea(["Black", "Ivory"]);
    // base opacity-100 = visible on mobile/tablet; hover/opacity-0 only at lg+
    expect(html).toContain("opacity-100 transition-opacity");
    expect(area).toContain("lg:opacity-0");
    expect(area).toContain("lg:group-hover:opacity-100");
  });
});