"use client";

import ProductCarousel from "@/components/ShopDetails/ProductCarousel";
import type { Product } from "@/types/product";

export default function SimilarProducts({
  products,
  regionId,
  eyebrow,
  viewAllHref,
}: {
  products: Product[];
  regionId: string;
  eyebrow?: string;
  viewAllHref?: string;
}) {
  return (
    <ProductCarousel
      ctaLabel={viewAllHref ? "View all" : undefined}
      ctaUrl={viewAllHref}
      eyebrow={eyebrow}
      headerLayout="editorial"
      products={products}
      regionId={regionId}
      title="You may also like"
    />
  );
}