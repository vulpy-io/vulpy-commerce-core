"use client";

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { getPriceBounds } from "@/lib/medusa/money";
import { addRecentlyViewed } from "@/redux/features/recently-viewed-slice";
import type { AppDispatch } from "@/redux/store";
import type { ProductDetail } from "@/types/product-detail";

export function useTrackRecentlyViewed(product: ProductDetail) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const variant = product.variants[0];
    if (!(variant && product.handle)) {
      return;
    }

    const images = product.images;
    const bounds = getPriceBounds(
      product.variants.map((entry) => entry.discountedPrice)
    );

    dispatch(
      addRecentlyViewed({
        handle: product.handle,
        id: variant.id,
        title: product.title,
        price: variant.price,
        discountedPrice: variant.discountedPrice,
        minPrice: bounds.minPrice,
        maxPrice: bounds.maxPrice,
        quantity: 1,
        status: product.inStock === false ? "out_of_stock" : undefined,
        variantId: variant.id,
        imgs: {
          thumbnails: images,
          previews: images,
        },
      })
    );
  }, [dispatch, product]);
}
