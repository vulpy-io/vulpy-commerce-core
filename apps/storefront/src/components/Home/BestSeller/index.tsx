"use client";

import ProductCarousel from "@/components/ShopDetails/ProductCarousel";
import type { Product } from "@/types/product";

const BestSeller = ({
  products,
  regionId,
  title,
  subtitle,
}: {
  products: Product[];
  regionId: string;
  title: string;
  subtitle: string;
}) => {
  return (
    <ProductCarousel
      headerLayout="centered"
      products={products}
      regionId={regionId}
      sectionClassName=""
      showBorder={false}
      subtitle={subtitle}
      title={title}
    />
  );
};

export default BestSeller;
