"use client";

import type { HttpTypes } from "@medusajs/types";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import GatedAmount from "@/components/Product/GatedAmount";
import {
  PRODUCT_PLACEHOLDER_IMAGE,
  resolveMedusaAssetUrlOrFallback,
} from "@/lib/medusa/asset-url";
import { fromMedusaAmount } from "@/lib/medusa/money";
import {
  getOrderGrandTotal,
  getOrderItemsSubtotal,
  getOrderShippingTotal,
} from "@/lib/medusa/order-totals";
import { formatCartLineItemOptions } from "@/lib/medusa/product-options";

export default function OrderSummaryCard({
  order,
  currency,
  footer,
}: {
  order: HttpTypes.StoreOrder;
  currency: string;
  footer?: ReactNode;
}) {
  const subtotal = getOrderItemsSubtotal(order, currency);
  const shipping = getOrderShippingTotal(order, currency);
  const tax = fromMedusaAmount(order.tax_total, currency);
  const discount = fromMedusaAmount(order.discount_total, currency);
  const total = getOrderGrandTotal(order, currency);

  return (
    <div className="rounded-panel bg-white p-6 shadow-1">
      <h3 className="mb-4 font-semibold text-xl">Your order</h3>
      {order.items?.map((item) => {
        const productHandle = item.product?.handle ?? item.product_handle;
        const productUrl = productHandle
          ? `/products/${productHandle}`
          : "/shop";
        const thumbnail = resolveMedusaAssetUrlOrFallback(
          item.thumbnail,
          PRODUCT_PLACEHOLDER_IMAGE
        );

        return (
          <div
            className="flex justify-between border-gray-3 border-b py-2"
            key={item.id}
          >
            <div className="flex min-w-0 items-center gap-3 pr-3">
              <Link
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-panel bg-gray-3"
                href={productUrl}
              >
                <Image
                  alt={item.title ?? "product"}
                  className="h-full w-full object-cover"
                  height={56}
                  src={thumbnail}
                  width={56}
                />
              </Link>

              <div className="min-w-0">
                <Link
                  className="line-clamp-2 text-content-primary hover:text-content-brand"
                  href={productUrl}
                >
                  {item.title}
                </Link>
                {(() => {
                  const attributes = formatCartLineItemOptions(item);
                  return attributes ? (
                    <p className="mt-1 text-content-muted text-custom-sm">
                      {attributes}
                    </p>
                  ) : null;
                })()}
                <p className="mt-1 text-content-muted text-custom-sm">
                  <GatedAmount
                    amount={fromMedusaAmount(item.unit_price, currency)}
                    className="text-content-muted text-custom-sm"
                    currency={currency}
                  />{" "}
                  x {item.quantity ?? 1}
                </p>
              </div>
            </div>
            <span>
              <GatedAmount
                amount={
                  fromMedusaAmount(item.unit_price, currency) *
                  (item.quantity ?? 1)
                }
                currency={currency}
              />
            </span>
          </div>
        );
      })}
      <div className="flex justify-between py-2">
        <span>Subtotal</span>
        <GatedAmount amount={subtotal} currency={currency} />
      </div>
      <div className="flex justify-between py-2">
        <span>Shipping</span>
        <GatedAmount amount={shipping} currency={currency} />
      </div>
      {tax > 0 ? (
        <div className="flex justify-between py-2">
          <span>Tax</span>
          <GatedAmount amount={tax} currency={currency} />
        </div>
      ) : null}
      {discount > 0 ? (
        <div className="flex justify-between py-2 text-green">
          <span>Discount</span>
          <span className="inline-flex items-center gap-0.5 text-green">
            -
            <GatedAmount amount={discount} className="text-green" currency={currency} />
          </span>
        </div>
      ) : null}
      <div className="flex justify-between pt-4 font-semibold text-lg">
        <span>Total</span>
        <GatedAmount
          amount={total}
          className="font-semibold text-content-primary text-lg"
          currency={currency}
        />
      </div>
      {footer}
    </div>
  );
}
