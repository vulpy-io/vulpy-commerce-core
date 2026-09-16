"use client";

import type { HttpTypes } from "@medusajs/types";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { removeLineItemAction, updateCartQuantityAction } from "@/app/actions/cart";
import GatedAmount from "@/components/Product/GatedAmount";
import { useCart } from "@/context/CartContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveMedusaAssetUrlOrFallback } from "@/lib/medusa/asset-url";
import { formatCartLineItemOptions } from "@/lib/medusa/product-options";

const SingleItem = ({
  item,
  onNavigate,
}: {
  item: HttpTypes.StoreCartLineItem;
  onNavigate: () => void;
}) => {
  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [isPending, startTransition] = useTransition();
  const { applyCartResult } = useCart();
  const currency = useStoreCurrency();
  const thumbnail = resolveMedusaAssetUrlOrFallback(
    item.thumbnail,
    PRODUCT_PLACEHOLDER_IMAGE
  );
  const unitPrice = item.unit_price ?? 0;
  const productUrl = item.product?.handle
    ? `/products/${item.product.handle}`
    : "/shop";

  const attributes = formatCartLineItemOptions(item);

  useEffect(() => {
    setQuantity(item.quantity ?? 1);
  }, [item.quantity]);

  const handleRemove = () => {
    if (!item.id) {
      return;
    }
    startTransition(async () => {
      const result = await removeLineItemAction(item.id!);
      if (result) {
        applyCartResult(result, { mutation: "remove", source: "cart_drawer" });
      }
    });
  };

  const updateQuantity = (newQty: number) => {
    if (!item.id) {
      return;
    }
    setQuantity(newQty);
    startTransition(async () => {
      const result = await updateCartQuantityAction({
        lineItem: item.id!,
        quantity: newQty,
      });
      if (result) {
        applyCartResult(result, { mutation: "update", source: "cart_drawer" });
      }
    });
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex w-full items-start gap-4">
        <Link
          className="flex h-22.5 w-full max-w-[90px] items-center justify-center overflow-hidden rounded-panel bg-gray-3"
          href={productUrl}
          onClick={onNavigate}
        >
          <Image
            alt={item.title ?? "product"}
            className="h-full w-full object-cover"
            height={90}
            src={thumbnail}
            width={90}
          />
        </Link>
        <div className="min-w-0">
          <Link
            className="mb-0 block font-semibold text-content-primary hover:text-content-brand"
            href={productUrl}
            onClick={onNavigate}
          >
            {item.title}
          </Link>
          {attributes ? (
            <p className="mt-1 text-content-muted text-custom-sm">{attributes}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <p className="text-custom-sm">
              <GatedAmount
                amount={unitPrice}
                className="text-custom-sm"
                currency={currency}
              />{" "}
              x
            </p>
            <div className="flex items-center rounded-md border border-gray-3">
              <button
                className="flex h-8 w-8 items-center justify-center hover:text-content-brand"
                disabled={isPending}
                onClick={() => updateQuantity(Math.max(0, quantity - 1))}
                type="button"
              >
                -
              </button>
              <span className="flex h-8 w-8 items-center justify-center border-gray-4 border-x text-custom-sm">
                {quantity}
              </span>
              <button
                className="flex h-8 w-8 items-center justify-center hover:text-content-brand"
                disabled={isPending}
                onClick={() => updateQuantity(quantity + 1)}
                type="button"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex min-h-22.5 flex-col items-end justify-between">
        <button
          aria-label="Remove item"
          className="text-content-muted hover:text-status-danger"
          disabled={isPending}
          onClick={handleRemove}
          type="button"
        >
          <svg
            className="h-4 w-4 fill-current"
            fill="none"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M3.30546 3.30546C3.56581 3.04511 3.98792 3.04511 4.24827 3.30546L8 7.05719L11.7517 3.30546C12.0121 3.04511 12.4342 3.04511 12.6945 3.30546C12.9549 3.56581 12.9549 3.98792 12.6945 4.24827L8.94281 8L12.6945 11.7517C12.9549 12.0121 12.9549 12.4342 12.6945 12.6945C12.4342 12.9549 12.0121 12.9549 11.7517 12.6945L8 8.94281L4.24827 12.6945C3.98792 12.9549 3.56581 12.9549 3.30546 12.6945C3.04511 12.4342 3.04511 12.0121 3.30546 11.7517L7.05719 8L3.30546 4.24827C3.04511 3.98792 3.04511 3.56581 3.30546 3.30546Z"
              fillRule="evenodd"
            />
          </svg>
        </button>
        <p className="text-content-primary text-custom-sm">
          <GatedAmount
            amount={unitPrice * quantity}
            className="text-content-primary text-custom-sm"
            currency={currency}
          />
        </p>
      </div>
    </div>
  );
};

export default SingleItem;
