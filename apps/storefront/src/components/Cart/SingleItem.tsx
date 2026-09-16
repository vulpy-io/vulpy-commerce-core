"use client";

import type { HttpTypes } from "@medusajs/types";
import Image from "next/image";
import { useState, useTransition } from "react";
import {
  removeLineItemAction,
  updateCartQuantityAction,
} from "@/app/actions/cart";
import GatedAmount from "@/components/Product/GatedAmount";
import config from "@/config";
import { useCart } from "@/context/CartContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveMedusaAssetUrlOrFallback } from "@/lib/medusa/asset-url";
import { formatCartLineItemOptions } from "@/lib/medusa/product-options";

const SingleItem = ({ item }: { item: HttpTypes.StoreCartLineItem }) => {
  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [isPending, startTransition] = useTransition();
  const { applyCartResult } = useCart();
  const currency = useStoreCurrency();

  const unitPrice = item.unit_price ?? 0;
  const thumbnail = resolveMedusaAssetUrlOrFallback(
    item.thumbnail,
    PRODUCT_PLACEHOLDER_IMAGE
  );
  const attributes = formatCartLineItemOptions(item);

  const updateQuantity = (newQty: number) => {
    if (!item.id) {
      return;
    }
    setQuantity(newQty);
    startTransition(async () => {
      const result = await updateCartQuantityAction({
        countryCode: config.defaultCountryCode,
        lineItem: item.id!,
        quantity: newQty,
      });
      if (result) {
        applyCartResult(result, { mutation: "update", source: "cart_page" });
      }
    });
  };

  const handleRemove = () => {
    if (!item.id) {
      return;
    }
    startTransition(async () => {
      const result = await removeLineItemAction(item.id!);
      if (result) {
        applyCartResult(result, { mutation: "remove", source: "cart_page" });
      }
    });
  };

  return (
    <div className="flex items-center border-gray-3 border-t px-7.5 py-5">
      <div className="min-w-[400px]">
        <div className="flex items-center gap-5.5">
          <div className="flex h-17.5 w-full max-w-[80px] items-center justify-center rounded-control bg-gray-2">
            <Image alt={item.title ?? "product"} height={80} src={thumbnail} width={80} />
          </div>
          <div>
            <h3 className="text-content-primary">{item.title}</h3>
            {attributes ? (
              <p className="mt-1 text-content-muted text-custom-sm">{attributes}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-w-[180px]">
        <GatedAmount amount={unitPrice} currency={currency} />
      </div>

      <div className="min-w-[275px]">
        <div className="flex w-max items-center rounded-md border border-gray-3">
          <button
            className="flex h-11.5 w-11.5 items-center justify-center hover:text-content-brand"
            disabled={isPending}
            onClick={() => updateQuantity(Math.max(0, quantity - 1))}
            type="button"
          >
            -
          </button>
          <span className="flex h-11.5 w-16 items-center justify-center border-gray-4 border-x">
            {quantity}
          </span>
          <button
            className="flex h-11.5 w-11.5 items-center justify-center hover:text-content-brand"
            disabled={isPending}
            onClick={() => updateQuantity(quantity + 1)}
            type="button"
          >
            +
          </button>
        </div>
      </div>

      <div className="min-w-[200px]">
        <GatedAmount amount={unitPrice * quantity} currency={currency} />
      </div>

      <div className="flex min-w-[50px] justify-end">
        <button
          className="flex h-9.5 w-full max-w-[38px] items-center justify-center rounded-lg border border-gray-3 bg-gray-2 text-content-primary hover:text-status-danger"
          disabled={isPending}
          onClick={handleRemove}
          type="button"
        >
          x
        </button>
      </div>
    </div>
  );
};

export default SingleItem;
