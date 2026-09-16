"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { addToCartAction } from "@/app/actions/cart";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import { usePreviewSlider } from "@/app/context/PreviewSliderContext";
import PageLayout, { type BreadcrumbItem } from "@/components/Common/PageLayout";
import PaymentMethodIcons from "@/components/Common/PaymentMethodIcons";
import { cmsSectionProps } from "@/components/cms/cms-section";
import LoginToSeePrice from "@/components/Product/LoginToSeePrice";
import ProductAttributesTable from "@/components/Product/ProductAttributesTable";
import ProductDetailsTabs from "@/components/Product/ProductDetailsTabs";
import ProductImageZoomButton from "@/components/Product/ProductImageZoomButton";
import ProductPrice from "@/components/Product/ProductPrice";
import ProductQuantityStepper from "@/components/Product/ProductQuantityStepper";
import ProductSaleBadge from "@/components/Product/ProductSaleBadge";
import ProductStoreTagBadges from "@/components/Product/ProductStoreTagBadges";
import WishlistButton from "@/components/Product/WishlistButton";
import { useCanSeePrices, usePricePersona } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useTrackRecentlyViewed } from "@/hooks/useTrackRecentlyViewed";
import { useWishlistToggle } from "@/hooks/useWishlistToggle";
import { quotationEn, storefrontEn } from "@/i18n/quotation";
import type { CmsPaymentMethod } from "@/lib/cms/types";
import { getPriceBounds } from "@/lib/medusa/money";
import { getAddActionLabel, resolveAddCta } from "@/lib/medusa/persona";
import {
  getPdpSpecificationAttributes,
  resolveProductContains,
  resolveProductEan,
} from "@/lib/medusa/product-attributes";
import { formatVariantOptionLabel, getCustomerFacingOptions } from "@/lib/medusa/product-options";
import { getMaxPurchasableQuantity } from "@/lib/medusa/stock";
import {
  findPreviewVariant,
  findVariantByOptions,
  getInitialSelectedOptions,
  selectOptionValue,
  variantToDisplayProduct,
} from "@/lib/medusa/variant-options";
import { updateproductDetails } from "@/redux/features/product-details";
import type { AppDispatch } from "@/redux/store";
import type { Product } from "@/types/product";
import type { ProductAttribute, ProductDetail } from "@/types/product-detail";
import RecentlyViewedBlock from "./RecentlyViewedBlock";
import SimilarProducts from "./SimilarProducts";
import VariantOptions from "./VariantOptions";

function GuestTradeNote() {
  const parts = quotationEn.guestTradeNote.split("sign in");

  if (parts.length !== 2) {
    return (
      <p className="text-[13px] text-content-muted leading-relaxed">
        {quotationEn.guestTradeNote}
      </p>
    );
  }

  return (
    <p className="text-[13px] text-content-muted leading-relaxed">
      {parts[0]}
      <Link
        className="border-border-strong border-b text-content-primary transition-colors duration-200 ease-out hover:border-content-primary"
        href="/signin"
      >
        sign in
      </Link>
      {parts[1]}
    </p>
  );
}

function buildFallbackAttributes(
  product: ProductDetail,
  selectedSku?: string | null
): ProductAttribute[] {
  const attributes: ProductAttribute[] = [];

  if (selectedSku) {
    attributes.push({ label: storefrontEn.sku, value: selectedSku });
  }

  const selectedVariant = product.variants.find((v) => v.sku === selectedSku);
  if (selectedVariant) {
    for (const [label, value] of Object.entries(selectedVariant.optionValues)) {
      attributes.push({ label, value });
    }
  }

  return attributes;
}

export default function ProductDetails({
  product,
  regionId,
  relatedProducts = [],
  breadcrumbItems,
  breadcrumbCurrentPath,
  includeBreadcrumbJsonLd = true,
  children,
  shortDescriptionOverride,
  longDescriptionOverride,
  initialVariantId,
  paymentMethods,
}: {
  product: ProductDetail;
  regionId: string;
  relatedProducts?: Product[];
  breadcrumbItems: BreadcrumbItem[];
  breadcrumbCurrentPath?: string;
  includeBreadcrumbJsonLd?: boolean;
  children?: React.ReactNode;
  shortDescriptionOverride?: string;
  longDescriptionOverride?: string;
  initialVariantId?: string;
  paymentMethods?: CmsPaymentMethod[];
}) {
  const [quantity, setQuantity] = useState(1);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState(() =>
    getInitialSelectedOptions(product, initialVariantId)
  );
  const [lastChangedOption, setLastChangedOption] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const { applyCartResult, optimisticAddItem } = useCart();
  const canSeePrices = useCanSeePrices();
  const persona = usePricePersona();
  const currency = useStoreCurrency();
  const { openCartModal } = useCartModalContext();
  const { openPreviewModal } = usePreviewSlider();
  const dispatch = useDispatch<AppDispatch>();

  const selectedVariant = useMemo(
    () => findVariantByOptions(product.variants, selectedOptions),
    [product.variants, selectedOptions]
  );

  const previewVariant = useMemo(
    () =>
      findPreviewVariant(product.variants, selectedOptions, lastChangedOption),
    [product.variants, selectedOptions, lastChangedOption]
  );

  // Gallery images follow the exact selected variant when one exists, even if
  // it is out of stock — its thumbnail may differ from the preview/fallback
  // variant. Only when there is no exact match do we fall back to the best
  // partial (preview) variant so shoppers still see an image while making a
  // partial selection.
  const galleryVariant = selectedVariant ?? previewVariant;

  const displayProduct = useMemo(() => {
    if (!previewVariant) {
      return null;
    }
    return variantToDisplayProduct(product, previewVariant);
  }, [product, previewVariant]);

  // [isLoaded, imageUrl] — main image loading state for a fade-in. `key`
  // forces a fresh Image so the fade replays whenever the gallery image
  // changes to a new URL.
  const [mainImageLoaded, setMainImageLoaded] = useState(false);
  const imageSequence = useMemo(() => {
    const resolvedForVariant = galleryVariant
      ? variantToDisplayProduct(product, galleryVariant).imgs.previews
      : displayProduct?.imgs?.previews ?? product.images;
    return resolvedForVariant;
  }, [galleryVariant, displayProduct, product]);
  const mainImageUrl = imageSequence[previewIdx] ?? product.images[0];

  // Reset load state whenever the main image switches so the fade-in replays.
  useEffect(() => {
    setMainImageLoaded(false);
  }, [mainImageUrl]);

  useEffect(() => {
    if (!galleryVariant?.thumbnail) {
      setPreviewIdx(0);
      return;
    }
    const idx = imageSequence.indexOf(galleryVariant.thumbnail);
    setPreviewIdx(idx >= 0 ? idx : 0);
  }, [galleryVariant?.id, galleryVariant?.thumbnail, imageSequence]);

  const displayedImages = imageSequence;
  const variantInStock = Boolean(
    selectedVariant && selectedVariant.inStock !== false
  );
  const maxQuantity = selectedVariant
    ? getMaxPurchasableQuantity(selectedVariant)
    : 99;

  const wishlistProduct = useMemo(() => {
    const bounds = getPriceBounds(
      product.variants.map((variant) => variant.discountedPrice)
    );

    return {
      id: selectedVariant?.id ?? product.variants[0]?.id ?? product.productId,
      title: product.title,
      price: displayProduct?.price ?? product.variants[0]?.price ?? 0,
      discountedPrice:
        displayProduct?.discountedPrice ?? product.variants[0]?.discountedPrice ?? 0,
      minPrice: bounds.minPrice,
      maxPrice: bounds.maxPrice,
      handle: product.handle,
      variantId: selectedVariant?.id,
      variantLabel: selectedVariant
        ? formatVariantOptionLabel(selectedVariant.optionValues, product.options)
        : undefined,
      inStock: variantInStock,
      imgs: {
        thumbnails: imageSequence,
        previews: imageSequence,
      },
    };
  }, [displayProduct, imageSequence, product, selectedVariant, variantInStock]);

  const { isInWishlist, toggle: toggleWishlist } = useWishlistToggle(wishlistProduct);

  useTrackRecentlyViewed(product);

  const relatedCategoryHref = useMemo(() => {
    const categoryCrumb = [...breadcrumbItems]
      .reverse()
      .find((item) => item.href?.startsWith("/categories/"));
    return categoryCrumb?.href;
  }, [breadcrumbItems]);

  const customerFacingOptions = useMemo(
    () => getCustomerFacingOptions(product.options),
    [product.options]
  );

  const productForOptions = useMemo(
    () => ({ ...product, options: customerFacingOptions }),
    [product, customerFacingOptions]
  );

  const eanCode = resolveProductEan(product.attributes, selectedVariant?.ean);
  const containsContent = resolveProductContains(product.attributes);

  const productAttributes = useMemo(() => {
    if (product.attributes && product.attributes.length > 0) {
      return getPdpSpecificationAttributes(product.attributes);
    }

    return buildFallbackAttributes(product, selectedVariant?.sku);
  }, [product, selectedVariant?.sku]);

  const handleOptionChange = (optionTitle: string, value: string) => {
    setLastChangedOption(optionTitle);
    setSelectedOptions((current) =>
      selectOptionValue(product.variants, current, optionTitle, value)
    );
    setQuantity(1);
  };

  const handlePreviewSlider = () => {
    if (displayProduct) {
      dispatch(updateproductDetails(displayProduct));
      openPreviewModal(previewIdx);
    }
  };

  const handleAddToCart = () => {
    if (!selectedVariant?.id) {
      toast.error("Please select all options");
      return;
    }

    if (!variantInStock) {
      return;
    }

    const rollback = optimisticAddItem({
      variantId: selectedVariant.id,
      quantity,
      title: product.title,
      thumbnail: imageSequence[0],
      unitPrice: selectedVariant.discountedPrice || selectedVariant.price,
      handle: product.handle,
    });
    startTransition(async () => {
      try {
        const result = await addToCartAction({
          quantity,
          regionId,
          variantId: selectedVariant.id,
        });
        applyCartResult(result, { mutation: "add", source: "pdp" });
        openCartModal();
      } catch {
        rollback();
        toast.error("Could not add to cart");
      }
    });
  };

  const shortDescription =
    shortDescriptionOverride?.trim() || product.description?.trim() || "";
  const descriptionContent =
    longDescriptionOverride?.trim() ||
    product.fullDescription?.trim() ||
    product.description?.trim() ||
    "Product details coming soon.";

  return (
    <PageLayout
      breadcrumbCurrentPath={breadcrumbCurrentPath}
      breadcrumbItems={breadcrumbItems}
      breadcrumbVariant="compact"
      includeBreadcrumbJsonLd={includeBreadcrumbJsonLd}
    >
      <section className="relative overflow-hidden pt-2.5 pb-20 lg:pt-5 xl:pt-7.5">
        <div className="container w-full">
          <div className="flex flex-col gap-10 lg:flex-row">
            <div className="w-full lg:max-w-[700px]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-3">
                <div className="relative order-1 aspect-[6/7] w-full flex-1 overflow-hidden rounded-panel md:order-2 md:min-w-0">
                  {(displayProduct &&
                    displayProduct.discountedPrice < displayProduct.price) ||
                  product.storeTags?.length ? (
                    <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
                      {displayProduct &&
                      displayProduct.discountedPrice < displayProduct.price ? (
                        <ProductSaleBadge
                          discountedPrice={displayProduct.discountedPrice}
                          price={displayProduct.price}
                        />
                      ) : null}
                      <ProductStoreTagBadges tags={product.storeTags} />
                    </div>
                  ) : null}
                  <ProductImageZoomButton onClick={handlePreviewSlider} />
                  <Image
                    alt={product.title}
                    className={`h-full w-full object-cover transition-opacity duration-300 ease-out ${
                      mainImageLoaded ? "opacity-100" : "opacity-0"
                    }`}
                    height={817}
                    key={mainImageUrl}
                    onLoad={() => setMainImageLoaded(true)}
                    src={mainImageUrl}
                    width={700}
                  />
                </div>
                <div className="order-2 flex flex-wrap gap-3 md:order-1 md:shrink-0 md:flex-col md:flex-nowrap">
                  {imageSequence.map((img, idx) => (
                    <button
                      className={`aspect-[6/7] w-15 shrink-0 overflow-hidden rounded-panel border-2 duration-200 ease-out hover:border-action-primary-background ${
                        previewIdx === idx ? "border-action-primary-background" : "border-transparent"
                      }`}
                      key={`${img}-${idx}`}
                      onClick={() => setPreviewIdx(idx)}
                      type="button"
                    >
                      <Image
                        alt=""
                        className="h-full w-full object-cover"
                        height={70}
                        src={img}
                        width={60}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col">
              {/* Stock status intentionally hidden on PDP (2026-08); restore ProductStockStatus if needed */}

              <h1 className="h1 mb-2">
                {product.title}
              </h1>

              {displayProduct ? (
                <div className="mb-4 flex flex-wrap items-center gap-5">
                  <ProductPrice
                    className="flex items-center gap-3"
                    compareClassName="text-content-muted text-base line-through"
                    currency={currency}
                    currentClassName={`font-normal text-xl ${
                      displayProduct.discountedPrice < displayProduct.price
                        ? "text-commerce-sale"
                        : "text-content-secondary"
                    }`}
                    discountedPrice={displayProduct.discountedPrice}
                    loginClassName="text-lg"
                    price={displayProduct.price}
                  />
                </div>
              ) : (
                <p className="mb-4 font-medium text-content-muted text-sm">
                  {storefrontEn.unavailableVariant}
                </p>
              )}

              {shortDescription ? (
                <p className="order-6 mb-6 text-content-secondary lg:order-3">{shortDescription}</p>
              ) : null}

              <div className="order-3 lg:order-4">
                <VariantOptions
                  onChange={handleOptionChange}
                  product={productForOptions}
                  selectedOptions={selectedOptions}
                />
              </div>

              <div className="order-4 mb-6 lg:order-5">
                <div className="flex flex-wrap items-start gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[11px] text-content-primary uppercase tracking-[0.14em]">
                    Qty
                  </span>
                  <ProductQuantityStepper
                    disabled={!variantInStock}
                    max={maxQuantity}
                    onDecrease={() => setQuantity(Math.max(1, quantity - 1))}
                    onIncrease={() =>
                      setQuantity(Math.min(maxQuantity, quantity + 1))
                    }
                    quantity={quantity}
                  />
                </div>

                {resolveAddCta(canSeePrices, persona) === "login" ? (
                  <div className="flex flex-col items-center gap-4">
                    <span className="inline-flex min-h-12 items-center justify-center gap-2 px-8 font-bold text-[12px] text-content-brand">
                      <LoginToSeePrice className="text-md" label="Login to see price" />
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <button
                      className="inline-flex min-h-12 items-center justify-center rounded-control bg-action-primary-background px-8 font-bold text-[12px] text-white uppercase tracking-[0.14em] hover:bg-action-primary-hover disabled:opacity-50"
                      disabled={isPending || !selectedVariant || !variantInStock}
                      onClick={handleAddToCart}
                      type="button"
                    >
                      {getAddActionLabel({
                        canSeePrices,
                        inStock: variantInStock,
                        pending: isPending,
                      })}
                    </button>
                  </div>
                )}

                <WishlistButton filled={isInWishlist} onClick={toggleWishlist} />
                </div>

                {paymentMethods && paymentMethods.length > 0 ? (
                  <div className="mt-5 border-border-subtle border-t pt-4">
                    <PaymentMethodIcons paymentMethods={paymentMethods} />
                  </div>
                ) : null}
              </div>

              {persona === "quote" ? (
                <div className="order-5 mb-7 border-border-subtle border-t pt-3.5 lg:order-6">
                  <GuestTradeNote />
                </div>
              ) : null}

              {(selectedVariant?.sku || eanCode) && (
                <div className="order-7 mb-2.5 grid grid-cols-1 gap-y-1 border-border-subtle border-t pt-3.5 text-[13px]">
                  <div>
                    {selectedVariant?.sku ? (
                      <p className="flex items-baseline justify-between gap-4 py-[5px]">
                        <span className="text-content-muted">{storefrontEn.sku}</span>
                        <span className="text-right text-content-secondary">
                          {selectedVariant.sku}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    {eanCode ? (
                      <p className="flex items-baseline justify-between gap-4 py-[5px]">
                        <span className="text-content-muted">{storefrontEn.ean}</span>
                        <span className="text-right text-content-secondary">
                          {eanCode}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="order-8">
                <ProductDetailsTabs
                  contains={
                    containsContent ? (
                      <div className="whitespace-pre-line text-content-secondary">{containsContent}</div>
                    ) : undefined
                  }
                  delivery={
                    <>
                      <p>{storefrontEn.deliveryHelp}</p>
                      <p className="mt-3">{storefrontEn.deliverySupport}</p>
                    </>
                  }
                  description={
                    <div className="whitespace-pre-line text-content-secondary">{descriptionContent}</div>
                  }
                  features={
                    productAttributes.length > 0 ? (
                      <ProductAttributesTable attributes={productAttributes} embedded />
                    ) : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {children ? (
        <section
          className="pb-10"
          {...cmsSectionProps({ type: "product-content", context: "product" })}
        >
          <div className="w-full">{children}</div>
        </section>
      ) : null}

      <SimilarProducts
        eyebrow="Complete the room"
        products={relatedProducts}
        regionId={regionId}
        viewAllHref={relatedCategoryHref}
      />
      <RecentlyViewedBlock currentHandle={product.handle} regionId={regionId} />
    </PageLayout>
  );
}
