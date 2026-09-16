"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useModalContext } from "@/app/context/QuickViewModalContext";
import FinishSwatch from "@/components/Product/FinishSwatch";
import ProductPrice from "@/components/Product/ProductPrice";
import ProductSaleBadge from "@/components/Product/ProductSaleBadge";
import ProductStoreTagBadges from "@/components/Product/ProductStoreTagBadges";
import WishlistButton from "@/components/Product/WishlistButton";
import { useCanSeePrices, usePricePersona } from "@/context/AuthContext";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useAddToCart } from "@/hooks/useAddToCart";
import { usePrefetchOnIntent } from "@/hooks/usePrefetchOnIntent";
import { useWishlistToggle } from "@/hooks/useWishlistToggle";
import { trackProductImpression, trackSelectItem } from "@/lib/analytics";
import { PRODUCT_PLACEHOLDER_IMAGE } from "@/lib/medusa/asset-url";
import { hasPriceRange } from "@/lib/medusa/money";
import { resolveAddCta } from "@/lib/medusa/persona";
import { updateproductDetails } from "@/redux/features/product-details";
import { updateQuickView } from "@/redux/features/quickView-slice";
import type { AppDispatch } from "@/redux/store";
import type { Product, ProductFinishVariant } from "@/types/product";

const ProductItem = ({
  item,
  regionId,
  tagsPointerEventsNone = false,
  showActions = true,
  transparentBackground = false,
  listId,
  listName,
  position,
}: {
  item: Product;
  regionId: string;
  tagsPointerEventsNone?: boolean;
  showActions?: boolean;
  transparentBackground?: boolean;
  listId?: string;
  listName?: string;
  position?: number;
}) => {
  const { openModal } = useModalContext();
  const dispatch = useDispatch<AppDispatch>();
  const canSeePrices = useCanSeePrices();
  const persona = usePricePersona();
  const hasAnalytics = useHasAnalyticsConsent();
  const currency = useStoreCurrency();

  const productUrl = item.handle
    ? `/products/${item.handle}`
    : "/shop";
  const prefetchHandlers = usePrefetchOnIntent(productUrl);

  const resolvedListId = listId ?? listName ?? "product_grid";
  const resolvedListName = listName ?? resolvedListId;

  const analyticsProduct = {
    productId: item.id,
    variantId: item.variantId,
    name: item.title,
    brand: item.brand,
    price: item.discountedPrice || item.price,
    listId: resolvedListId,
    listName: resolvedListName,
    position,
  };

  useEffect(() => {
    if (!hasAnalytics) {
      return;
    }
    trackProductImpression(analyticsProduct);
  }, [hasAnalytics, item.id]);

  const inStock = item.inStock !== false;

  const wishlistProduct = {
    id: item.id,
    title: item.title,
    price: item.price,
    discountedPrice: item.discountedPrice,
    minPrice: item.minPrice,
    maxPrice: item.maxPrice,
    handle: item.handle,
    variantId: item.variantId,
    variantLabel: item.variantLabel,
    inStock,
    imgs: item.imgs,
  };

  const { isInWishlist, toggle: toggleWishlist } = useWishlistToggle(wishlistProduct);
  const { addToCart: addToQuotationBag } = useAddToCart();
  const router = useRouter();
  const [isImageHovered, setIsImageHovered] = useState(false);
  const [hoveredFinish, setHoveredFinish] = useState<string | null>(null);

  const previewImage = item.imgs?.previews?.[0] ?? PRODUCT_PLACEHOLDER_IMAGE;

  const finishVariantMap = new Map<string, ProductFinishVariant>();
  for (const finishVariant of item.finishVariants ?? []) {
    finishVariantMap.set(finishVariant.name, finishVariant);
  }

  const hoveredFinishVariant = hoveredFinish
    ? finishVariantMap.get(hoveredFinish)
    : undefined;

  const secondImage = item.imgs?.previews?.[1] ?? null;
  // Mounted up front so the cross-fade is instant (no load pop-in on hover).
  const finishHoverLayers = (item.finishVariants ?? []).filter(
    (finishVariant) => Boolean(finishVariant.image)
  );

  // Finish hover shows that finish's variant image; plain image hover shows
  // the second product image. Falls back to the second image when a finish
  // has no dedicated variant image.
  const activeHoverImage = hoveredFinishVariant?.image ?? secondImage;
  const showHoverImage =
    activeHoverImage !== null && (isImageHovered || hoveredFinish !== null);
  const isActiveHoverLayer = (src: string) =>
    showHoverImage && activeHoverImage === src;

  // Reverting to the main image after leaving a swatch is slightly delayed so
  // flying across the row cross-fades finish A → finish B directly instead of
  // flashing back to the main image between swatches.
  const SWATCH_REVERT_DELAY_MS = 150;
  const hoverRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFinishHover = (finish: string) => {
    if (hoverRevertTimer.current) {
      clearTimeout(hoverRevertTimer.current);
      hoverRevertTimer.current = null;
    }
    setHoveredFinish(finish);
  };

  const handleFinishLeave = () => {
    if (hoverRevertTimer.current) {
      clearTimeout(hoverRevertTimer.current);
    }
    hoverRevertTimer.current = setTimeout(() => {
      setHoveredFinish(null);
      hoverRevertTimer.current = null;
    }, SWATCH_REVERT_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (hoverRevertTimer.current) {
        clearTimeout(hoverRevertTimer.current);
      }
    };
  }, []);

  const handleQuickViewUpdate = () => {
    dispatch(updateQuickView({ ...item }));
    openModal();
  };

  const handleProductDetails = () => {
    dispatch(updateproductDetails({ ...item }));
  };

  return (
    <article
      className={
        inStock
          ? `group flex h-full flex-col ${transparentBackground ? "bg-transparent" : "bg-product-card-background"}`
          : `group flex h-full flex-col ${transparentBackground ? "bg-transparent" : "bg-product-card-background"} opacity-60 hover:opacity-100`
      }
    >
      <div className="relative mb-4 aspect-[6/7] w-full overflow-hidden rounded-product-card bg-product-card-media-background">
        <Link
          className="flex h-full w-full items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-product-card-title-hover focus-visible:outline-offset-[-2px]"
          href={productUrl}
          onClick={() => {
            if (hasAnalytics) {
              trackSelectItem(analyticsProduct);
            }
          }}
          {...prefetchHandlers}
        >
          <div
            className="relative h-full w-full"
            onMouseEnter={() => {
              // Moving onto the image takes over immediately — cancel any
              // pending swatch revert so the finish image doesn't linger.
              if (hoverRevertTimer.current) {
                clearTimeout(hoverRevertTimer.current);
                hoverRevertTimer.current = null;
              }
              setHoveredFinish(null);
              setIsImageHovered(true);
            }}
            onMouseLeave={() => setIsImageHovered(false)}
          >
            <Image
              alt={item.title}
              className={`h-full w-full object-cover transition-opacity duration-300 ease-out ${
                showHoverImage ? "opacity-0" : "opacity-100"
              }`}
              height={467}
              src={previewImage}
              width={400}
            />
            {secondImage ? (
              <Image
                alt=""
                aria-hidden
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
                  isActiveHoverLayer(secondImage) ? "opacity-100" : "opacity-0"
                }`}
                height={467}
                src={secondImage}
                width={400}
              />
            ) : null}
            {finishHoverLayers.map((finishVariant) => (
              <Image
                alt=""
                aria-hidden
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
                  isActiveHoverLayer(finishVariant.image as string)
                    ? "opacity-100"
                    : "opacity-0"
                }`}
                height={467}
                key={finishVariant.variantId}
                src={finishVariant.image as string}
                width={400}
              />
            ))}
          </div>
        </Link>

        {(!hasPriceRange(item.minPrice, item.maxPrice) &&
          item.price > item.discountedPrice) ||
        item.storeTags?.length ? (
          <div
            className={`absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 ${
              tagsPointerEventsNone ? "pointer-events-none" : ""
            }`}
          >
            {!hasPriceRange(item.minPrice, item.maxPrice) &&
            item.price > item.discountedPrice ? (
              <ProductSaleBadge
                discountedPrice={item.discountedPrice}
                price={item.price}
              />
            ) : null}
            <ProductStoreTagBadges tags={item.storeTags} />
          </div>
        ) : null}

        {showActions === false ? null : (
          <div className="absolute bottom-0 left-0 hidden w-full translate-y-0 flex-nowrap items-center justify-center gap-2.5 pb-4 duration-200 ease-linear lg:flex lg:translate-y-full lg:group-hover:translate-y-0 lg:group-focus-within:translate-y-0">
          <button
            aria-label="Quick view"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-product-card bg-product-card-icon-background text-product-card-icon-foreground shadow-1 duration-200 ease-out hover:text-product-card-icon-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-product-card-title-hover focus-visible:outline-offset-2"
            onClick={handleQuickViewUpdate}
            type="button"
          >
            <svg
              className="fill-current"
              fill="none"
              height="20"
              viewBox="0 0 16 16"
              width="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                clipRule="evenodd"
                d="M8.00016 5.5C6.61945 5.5 5.50016 6.61929 5.50016 8C5.50016 9.38071 6.61945 10.5 8.00016 10.5C9.38087 10.5 10.5002 9.38071 10.5002 8C10.5002 6.61929 9.38087 5.5 8.00016 5.5ZM6.50016 8C6.50016 7.17157 7.17174 6.5 8.00016 6.5C8.82859 6.5 9.50016 7.17157 9.50016 8C9.50016 8.82842 8.82859 9.5 8.00016 9.5C7.17174 9.5 6.50016 8.82842 6.50016 8Z"
                fill=""
                fillRule="evenodd"
              />
              <path
                clipRule="evenodd"
                d="M8.00016 2.16666C4.99074 2.16666 2.96369 3.96946 1.78721 5.49791L1.76599 5.52546C1.49992 5.87102 1.25487 6.18928 1.08862 6.5656C0.910592 6.96858 0.833496 7.40779 0.833496 8C0.833496 8.5922 0.910592 9.03142 1.08862 9.4344C1.25487 9.81072 1.49992 10.129 1.76599 10.4745L1.78721 10.5021C2.96369 12.0305 4.99074 13.8333 8.00016 13.8333C11.0096 13.8333 13.0366 12.0305 14.2131 10.5021L14.2343 10.4745C14.5004 10.129 14.7455 9.81072 14.9117 9.4344C15.0897 9.03142 15.1668 8.5922 15.1668 8C15.1668 7.40779 15.0897 6.96858 14.9117 6.5656C14.7455 6.18927 14.5004 5.87101 14.2343 5.52545L14.2131 5.49791C13.0366 3.96946 11.0096 2.16666 8.00016 2.16666ZM2.57964 6.10786C3.66592 4.69661 5.43374 3.16666 8.00016 3.16666C10.5666 3.16666 12.3344 4.69661 13.4207 6.10786C13.7131 6.48772 13.8843 6.7147 13.997 6.9697C14.1023 7.20801 14.1668 7.49929 14.1668 8C14.1668 8.50071 14.1023 8.79199 13.997 9.0303C13.8843 9.28529 13.7131 9.51227 13.4207 9.89213C12.3344 11.3034 10.5666 12.8333 8.00016 12.8333C5.43374 12.8333 3.66592 11.3034 2.57964 9.89213C2.28725 9.51227 2.11599 9.28529 2.00334 9.0303C1.89805 8.79199 1.8335 8.50071 1.8335 8C1.8335 7.49929 1.89805 7.20801 2.00334 6.9697C2.11599 6.7147 2.28725 6.48772 2.57964 6.10786Z"
                fill=""
                fillRule="evenodd"
              />
            </svg>
          </button>

          <WishlistButton
            filled={isInWishlist}
            onClick={toggleWishlist}
            variant="card"
          />
          </div>
        )}
      </div>

      <div className="grow">
        <h3
          className="mb-2.5 font-normal text-[15px] text-product-card-title leading-[1.4] duration-200 ease-out hover:text-product-card-title-hover"
          onClick={handleProductDetails}
        >
          <Link
            className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-product-card-title-hover focus-visible:outline-offset-2"
            href={productUrl}
            onClick={() => {
              if (hasAnalytics) {
                trackSelectItem(analyticsProduct);
              }
            }}
          >
            {item.title}
          </Link>
        </h3>

        {item.finishes?.length && item.finishes.length > 1 ? (
          <div className="-mt-1.5 mb-2.5 flex flex-wrap items-center gap-1.5 opacity-100 transition-opacity duration-200 ease-out lg:opacity-0 lg:group-hover:opacity-100">
            {item.finishes.map((finish) => {
              const finishVariant = finishVariantMap.get(finish);
              return (
                <button
                  aria-label={`View ${item.title} in ${finish}`}
                  className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-product-card-title-hover focus-visible:outline-offset-2"
                  key={finish}
                  onClick={() => {
                    if (hasAnalytics) {
                      trackSelectItem({
                        ...analyticsProduct,
                        variantId: finishVariant?.variantId ?? item.variantId,
                      });
                    }
                    const url = item.handle
                      ? `/products/${item.handle}${
                          finishVariant ? `?variant=${finishVariant.variantId}` : ""
                        }`
                      : "/shop";
                    router.push(url);
                  }}
                  onMouseEnter={() => handleFinishHover(finish)}
                  onMouseLeave={handleFinishLeave}
                  type="button"
                >
                  <FinishSwatch name={finish} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {showActions !== false || canSeePrices ? (
        <span className="mt-auto flex flex-col gap-1">
          <ProductPrice
            className="font-normal text-[15px]"
            currency={currency}
            currentClassName="font-medium text-[15px] text-content-primary"
            discountedPrice={item.discountedPrice}
            loginClassName="text-[15px]"
            maxPrice={item.maxPrice}
            minPrice={item.minPrice}
            price={item.price}
          />
          {inStock ? null : (
            <span className="text-product-card-out-of-stock text-sm">Out of stock</span>
          )}
          {resolveAddCta(canSeePrices, persona) === "add_to_quotation" ? (
            <button
              className="mt-1 w-full rounded-control bg-product-card-action-background px-3 py-1.5 font-button text-product-card-action-foreground hover:bg-product-card-action-hover disabled:opacity-50"
              disabled={!inStock}
              onClick={() => addToQuotationBag(item, 1, { regionId })}
              type="button"
            >
              Add to quotation
            </button>
          ) : null}
        </span>
      ) : null}
    </article>
  );
};

export default ProductItem;