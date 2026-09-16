import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";
import ProductCarousel from "./ProductCarousel";

// The arrows are driven by useCarouselOverflow; force them visible so the
// regression assertions can reach the buttons.
vi.mock("@/hooks/useCarouselOverflow", () => ({
  useCarouselOverflow: () => ({
    showArrows: true,
    watchOverflow: true as const,
    onSwiper: () => undefined,
    onResize: () => undefined,
    onBreakpoint: () => undefined,
    onSlidesLengthChange: () => undefined,
  }),
}));

// The test is about the navigation buttons, not the product cards. ProductItem
// pulls in client-only contexts (redux, cart, consent) that don't exist here.
vi.mock("@/components/Common/ProductItem", () => ({
  default: () => null,
}));

vi.mock("swiper/react", () => ({
  Swiper: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SwiperSlide: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("swiper/modules", () => ({
  Pagination: {},
}));

// Swiper CSS imports would normally flow through Vite's CSS pipeline, which
// loads the app's PostCSS config (requires @tailwindcss/postcss in the test
// environment). The component under test doesn't need real styles — stub them.
vi.mock("swiper/css", () => ({}));
vi.mock("swiper/css/pagination", () => ({}));
vi.mock("swiper/css/navigation", () => ({}));

const minimalProduct: Product = {
  id: "prod_1",
  title: "Test Product",
  reviews: 0,
  price: 10,
  discountedPrice: 0,
};

function renderCarousel(): string {
  return renderToStaticMarkup(
    <ProductCarousel products={[minimalProduct]} regionId="reg_1" title="Related products" />,
  );
}

function buttonMarkup(markup: string, className: string): string {
  const match = markup.match(new RegExp(`<button[^>]*class="${className}"[^>]*>`));
  if (!match) {
    throw new Error(`expected a button with class "${className}" in rendered markup`);
  }
  return match[0];
}

describe("ProductCarousel", () => {
  it("gives the prev button a descriptive aria-label", () => {
    const prev = buttonMarkup(renderCarousel(), "swiper-button-prev");
    expect(prev).toContain('aria-label="Previous"');
  });

  it("gives the next button a descriptive aria-label", () => {
    const next = buttonMarkup(renderCarousel(), "swiper-button-next");
    expect(next).toContain('aria-label="Next"');
  });

  it("renders chevron icons aria-hidden instead of raw Unicode arrows", () => {
    const markup = renderCarousel();
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("←");
    expect(markup).not.toContain("→");
  });
});
