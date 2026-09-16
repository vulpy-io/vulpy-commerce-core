"use client";

import { useCallback } from "react";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { trackCustomEvent } from "@/lib/analytics";
import {
  addItemToWishlist,
  removeItemFromWishlist,
} from "@/redux/features/wishlist-slice";
import { type AppDispatch, useAppSelector } from "@/redux/store";
import type { Product } from "@/types/product";

type WishlistProduct = Pick<
  Product,
  | "id"
  | "title"
  | "price"
  | "discountedPrice"
  | "minPrice"
  | "maxPrice"
  | "handle"
  | "variantId"
  | "variantLabel"
  | "imgs"
> & {
  inStock?: boolean;
};

export function useWishlistToggle(product: WishlistProduct) {
  const dispatch = useDispatch<AppDispatch>();
  const wishlistItems = useAppSelector((state) => state.wishlistReducer.items);
  const isInWishlist = wishlistItems.some((item) => item.id === product.id);
  const hasAnalytics = useHasAnalyticsConsent();

  const toggle = useCallback(() => {
    if (isInWishlist) {
      dispatch(removeItemFromWishlist(product.id));
      if (hasAnalytics) {
        trackCustomEvent("Wishlist", "remove_from_wishlist", product.id);
      }
      toast.success("Removed from wishlist");
      return;
    }

    dispatch(
      addItemToWishlist({
        id: product.id,
        title: product.title,
        price: product.price,
        discountedPrice: product.discountedPrice,
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
        quantity: 1,
        handle: product.handle,
        variantId: product.variantId,
        variantLabel: product.variantLabel,
        status: product.inStock === false ? "out_of_stock" : "available",
        imgs: product.imgs,
      })
    );
    if (hasAnalytics) {
      trackCustomEvent("Wishlist", "add_to_wishlist", product.id);
    }
    toast.success("Added to wishlist");
  }, [dispatch, isInWishlist, product, hasAnalytics]);

  return { isInWishlist, toggle };
}
