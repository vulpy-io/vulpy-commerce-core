"use client";

import { useMemo } from "react";
import ProductCarousel from "@/components/ShopDetails/ProductCarousel";
import { useAppSelector } from "@/redux/store";
import type { Product } from "@/types/product";

export default function RecentlyViewedBlock({
  currentHandle,
  regionId,
}: {
  currentHandle: string;
  regionId: string;
}) {
  const items = useAppSelector((state) => state.recentlyViewedReducer.items);

  const products = useMemo<Product[]>(
    () =>
      items
        .filter((item) => item.handle !== currentHandle)
        .map((item) => ({
          id: item.id,
          handle: item.handle,
          title: item.title,
          price: item.price,
          discountedPrice: item.discountedPrice,
          minPrice: item.minPrice,
          maxPrice: item.maxPrice,
          reviews: 0,
          variantId: item.variantId ?? item.id,
          inStock: item.status !== "out_of_stock",
          imgs: item.imgs,
        })),
    [currentHandle, items]
  );

  return (
    <ProductCarousel
      headerLayout="editorial"
      products={products}
      regionId={regionId}
      title="Recently viewed"
    />
  );
}
