"use client";

import ProductCarousel from "@/components/ShopDetails/ProductCarousel";
import config from "@/config";
import type { Product } from "@/types/product";

const NewArrival = ({
  products,
  regionId,
  eyebrow,
  title,
  ctaLabel,
  ctaUrl,
}: {
  products: Product[];
  regionId: string;
  eyebrow: string;
  title: string;
  ctaLabel: string;
  ctaUrl: string;
}) => {
  return (
    <ProductCarousel
      ctaLabel={ctaLabel}
      ctaUrl={ctaUrl}
      eyebrow={eyebrow}
      headerLayout="eyebrow-cta"
      note={
        config.requireLoginForPrices
          ? "Prices are shown to registered customers - sign in for trade pricing."
          : undefined
      }
      products={products}
      regionId={regionId}
      sectionClassName="pt-15 xl:pt-24 pb-16 xl:pb-24"
      showBorder={false}
      title={title}
      variant="grid"
    />
  );
};

export default NewArrival;