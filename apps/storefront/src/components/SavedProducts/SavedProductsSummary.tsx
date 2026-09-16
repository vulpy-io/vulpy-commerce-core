"use client";

import GatedAmount from "@/components/Product/GatedAmount";
import ProductPrice from "@/components/Product/ProductPrice";
import { useCanSeePrices } from "@/context/AuthContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { PRODUCT_PLACEHOLDER_IMAGE } from "@/lib/medusa/asset-url";
import ProductSummary from "./ProductSummary";
import type { SavedProductListItem } from "./types";

export default function SavedProductsSummary({
  items,
  title,
}: {
  items: SavedProductListItem[];
  title: string;
}) {
  const canSeePrices = useCanSeePrices();
  const currency = useStoreCurrency();
  const total = items.reduce((sum, item) => sum + item.discountedPrice, 0);

  return (
    <div className="ml-auto w-full lg:max-w-[455px]">
      <div className="rounded-panel bg-white shadow-1">
        <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
          <h3 className="font-normal text-caps text-content-primary text-custom-sm text-xl">{title}</h3>
        </div>

        <div className="px-4 pt-2.5 pb-8.5 sm:px-8.5">
          {items.map((item) => {
            const productUrl = item.handle ? `/products/${item.handle}` : "/shop";
            const previewImage =
              item.imgs?.thumbnails?.[0] ?? PRODUCT_PLACEHOLDER_IMAGE;

            return (
              <div
                className="flex items-center justify-between gap-4 border-gray-3 border-b py-4"
                key={item.id}
              >
                <ProductSummary
                  compact
                  href={productUrl}
                  image={previewImage}
                  title={item.title}
                  variantLabel={item.variantLabel}
                />
                {canSeePrices && item.price > 0 ? (
                  <ProductPrice
                    className="shrink-0"
                    currency={currency}
                    discountedPrice={item.discountedPrice}
                    loginClassName="shrink-0"
                    price={item.price}
                  />
                ) : null}
              </div>
            );
          })}

          <div className="flex items-center justify-between border-gray-3 border-b py-3">
            <p className="text-content-primary">Items</p>
            <p className="text-content-primary">{items.length}</p>
          </div>

          {canSeePrices && total > 0 ? (
            <div className="flex items-center justify-between pt-5">
              <p className="font-semibold text-content-primary text-lg">Total</p>
              <GatedAmount
                amount={total}
                className="font-semibold text-content-primary text-lg"
                currency={currency}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}