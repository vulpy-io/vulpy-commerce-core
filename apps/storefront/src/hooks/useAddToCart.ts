"use client";

import { useTransition } from "react";
import toast from "react-hot-toast";
import { addToCartAction } from "@/app/actions/cart";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import { useCart } from "@/context/CartContext";
import type { Product } from "@/types/product";

export function useAddToCart() {
  const [isPending, startTransition] = useTransition();
  const { applyCartResult, optimisticAddItem } = useCart();
  const { openCartModal } = useCartModalContext();

  const addToCart = (
    product: Product,
    quantity = 1,
    options?: { onSuccess?: () => void; regionId?: string }
  ) => {
    if (!product.variantId) {
      toast.error("Product unavailable");
      return;
    }

    const rollback = optimisticAddItem({
      variantId: product.variantId,
      quantity,
      title: product.title,
      thumbnail: product.imgs?.previews?.[0] ?? product.imgs?.thumbnails?.[0],
      unitPrice: product.discountedPrice || product.price,
      handle: product.handle,
    });

    openCartModal();

    startTransition(async () => {
      try {
        const result = await addToCartAction({
          quantity,
          regionId: options?.regionId,
          variantId: product.variantId!,
        });
        applyCartResult(result, { mutation: "add", source: "product_card" });
        options?.onSuccess?.();
      } catch {
        rollback();
        toast.error("Could not add to cart");
      }
    });
  };

  return { addToCart, isPending };
}
