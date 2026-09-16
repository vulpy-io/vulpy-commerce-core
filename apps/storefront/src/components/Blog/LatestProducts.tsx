"use client";

import Image from "next/image";
import Link from "next/link";
import ProductPrice from "@/components/Product/ProductPrice";
import { PRODUCT_PLACEHOLDER_IMAGE } from "@/lib/medusa/asset-url";
import type { Product } from "@/types/product";

const LatestProducts = ({
  products,
  currencyCode,
}: {
  products: Product[];
  currencyCode: string;
}) => {
  return (
    <div className="mt-7.5 rounded-xl bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-4.5 sm:px-6">
        <h2 className="font-semibold text-content-primary text-lg">New arrivals</h2>
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-6">
          {products.slice(0, 3).map((product) => {
            const href = product.handle
              ? `/products/${product.handle}`
              : "/shop";
            const image =
              product.imgs?.thumbnails?.[0] ?? PRODUCT_PLACEHOLDER_IMAGE;

            return (
              <div className="flex items-center gap-6" key={product.id}>
                <div className="flex h-22.5 w-full max-w-[90px] items-center justify-center rounded-panel bg-gray-3">
                  <Image alt={product.title} height={74} src={image} width={74} />
                </div>
                <div>
                  <h3 className="mb-1 font-semibold text-content-primary hover:text-content-brand">
                    <Link href={href}>{product.title}</Link>
                  </h3>
                  <ProductPrice
                    className="text-custom-sm"
                    currency={currencyCode}
                    discountedPrice={product.discountedPrice}
                    loginClassName="text-custom-sm"
                    maxPrice={product.maxPrice}
                    minPrice={product.minPrice}
                    price={product.price}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LatestProducts;
