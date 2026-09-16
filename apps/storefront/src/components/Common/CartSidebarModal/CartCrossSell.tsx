"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCrossSellProductsAction } from "@/app/actions/cross-sell";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import ProductPrice from "@/components/Product/ProductPrice";
import { useCanSeePrices } from "@/context/AuthContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useAddToCart } from "@/hooks/useAddToCart";
import { PRODUCT_PLACEHOLDER_IMAGE } from "@/lib/medusa/asset-url";
import type { Product } from "@/types/product";

const SESSION_KEY = "crossSellProductIds";

function readSessionIds(): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSessionIds(ids: string[]) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(ids));
}

export default function CartCrossSell({
  cartVariantIds,
  regionId,
}: {
  cartVariantIds: string[];
  regionId: string;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const { closeCartModal } = useCartModalContext();
  const { addToCart } = useAddToCart();
  const canSeePrices = useCanSeePrices();
  const currency = useStoreCurrency();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cachedIds = readSessionIds();
      const fetched = await getCrossSellProductsAction(cartVariantIds, 12);

      if (cancelled) {
        return;
      }

      if (cachedIds?.length) {
        const byVariant = new Map(
          fetched.map((product) => [product.variantId, product])
        );
        const restored = cachedIds
          .map((id) => byVariant.get(id))
          .filter((product): product is Product => Boolean(product));

        if (restored.length) {
          setProducts(restored);
          return;
        }
      }

      writeSessionIds(
        fetched
          .map((product) => product.variantId)
          .filter((id): id is string => Boolean(id))
      );
      setProducts(fetched);
    }

    load().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [cartVariantIds]);

  if (!products.length) {
    return null;
  }

  return (
    <section className="mb-6 border-gray-3 border-t pt-5">
      <h3 className="mb-3 font-semibold text-content-primary">You may also like</h3>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {products.map((product) => {
          const href = product.handle ? `/products/${product.handle}` : "/shop";
          const image =
            product.imgs?.previews?.[0] ?? PRODUCT_PLACEHOLDER_IMAGE;

          return (
            <article
              className="w-[140px] shrink-0 rounded-lg border border-gray-3 bg-white p-2"
              key={product.variantId ?? product.id}
            >
              <Link href={href} onClick={() => closeCartModal()}>
                <Image
                  alt={product.title}
                  className="aspect-square w-full rounded-md object-contain"
                  height={120}
                  src={image}
                  width={120}
                />
              </Link>
              <p className="mt-2 line-clamp-2 text-content-primary text-custom-sm">
                {product.title}
              </p>
              <ProductPrice
                className="mt-1 text-custom-sm"
                currency={currency}
                currentClassName="font-medium text-custom-sm text-content-primary"
                discountedPrice={product.discountedPrice}
                loginClassName="mt-1 text-custom-sm"
                maxPrice={product.maxPrice}
                minPrice={product.minPrice}
                price={product.price}
              />
              {canSeePrices ? (
                <button
                  className="mt-2 w-full rounded-md bg-gray-1 px-2 py-1.5 text-content-primary text-custom-sm hover:bg-action-primary-background hover:text-white"
                  onClick={() =>
                    addToCart(product, 1, {
                      regionId,
                      onSuccess: () => closeCartModal(),
                    })
                  }
                  type="button"
                >
                  Add to cart
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
