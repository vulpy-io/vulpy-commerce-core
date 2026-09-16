"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { addToCartAction } from "@/app/actions/cart";
import { getProductDetailForQuickView } from "@/app/actions/product";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import { usePreviewSlider } from "@/app/context/PreviewSliderContext";
import { useModalContext } from "@/app/context/QuickViewModalContext";
import LoginToSeePrice from "@/components/Product/LoginToSeePrice";
import ProductImageZoomButton from "@/components/Product/ProductImageZoomButton";
import ProductPrice from "@/components/Product/ProductPrice";
import ProductQuantityStepper from "@/components/Product/ProductQuantityStepper";
import ProductSaleBadge from "@/components/Product/ProductSaleBadge";
import ProductStoreTagBadges from "@/components/Product/ProductStoreTagBadges";
import WishlistButton from "@/components/Product/WishlistButton";
import VariantOptions from "@/components/ShopDetails/VariantOptions";
import { useCanSeePrices, usePricePersona } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useWishlistToggle } from "@/hooks/useWishlistToggle";
import { storefrontEn } from "@/i18n/en";
import { firstFiniteAmount, getPriceBounds } from "@/lib/medusa/money";
import { getAddActionLabel, resolveAddCta } from "@/lib/medusa/persona";
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
import { type AppDispatch, useAppSelector } from "@/redux/store";
import type { ProductDetail } from "@/types/product-detail";

const QuickViewModal = ({ regionId }: { regionId: string }) => {
  const { isModalOpen, closeModal } = useModalContext();
  const { isModalPreviewOpen, openPreviewModal } = usePreviewSlider();
  const { openCartModal } = useCartModalContext();
  const { applyCartResult, optimisticAddItem } = useCart();
  const canSeePrices = useCanSeePrices();
  const persona = usePricePersona();
  const currency = useStoreCurrency();
  const [quantity, setQuantity] = useState(1);
  const [activePreview, setActivePreview] = useState(0);
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [lastChangedOption, setLastChangedOption] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  const listingProduct = useAppSelector((state) => state.quickViewReducer.value);

  const previewOpenRef = useRef(false);
  useEffect(() => {
    previewOpenRef.current = isModalPreviewOpen;
  }, [isModalPreviewOpen]);

  useEffect(() => {
    if (!(isModalOpen && listingProduct.handle)) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    getProductDetailForQuickView(listingProduct.handle, regionId, currency)
      .then((detail) => {
        if (cancelled || !detail) {
          return;
        }
        setProductDetail(detail);
        setSelectedOptions(getInitialSelectedOptions(detail));
        setActivePreview(0);
        setQuantity(1);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, listingProduct.handle, regionId, currency]);

  const selectedVariant = useMemo(() => {
    if (!productDetail) {
      return null;
    }
    return findVariantByOptions(productDetail.variants, selectedOptions);
  }, [productDetail, selectedOptions]);

  const previewVariant = useMemo(() => {
    if (!productDetail) {
      return null;
    }
    return findPreviewVariant(
      productDetail.variants,
      selectedOptions,
      lastChangedOption
    );
  }, [productDetail, selectedOptions, lastChangedOption]);

  const displayProduct = useMemo(() => {
    if (!(productDetail && previewVariant)) {
      return null;
    }
    return variantToDisplayProduct(productDetail, previewVariant);
  }, [productDetail, previewVariant]);

  const images = displayProduct?.imgs?.previews ?? listingProduct.imgs?.previews ?? [];
  const thumbnails = displayProduct?.imgs?.thumbnails ?? listingProduct.imgs?.thumbnails ?? [];
  const variantInStock = Boolean(selectedVariant && selectedVariant.inStock !== false);
  const maxQuantity = selectedVariant
    ? getMaxPurchasableQuantity(selectedVariant)
    : 99;

  useEffect(() => {
    if (!previewVariant?.thumbnail) {
      setActivePreview(0);
      return;
    }
    const idx = images.indexOf(previewVariant.thumbnail);
    setActivePreview(idx >= 0 ? idx : 0);
  }, [previewVariant?.id, previewVariant?.thumbnail, images]);

  const wishlistProduct = useMemo(() => {
    const detailBounds =
      productDetail && productDetail.variants.length > 0
        ? getPriceBounds(
            productDetail.variants.map((variant) => variant.discountedPrice)
          )
        : null;

    return {
      id: selectedVariant?.id ?? listingProduct.id,
      title: productDetail?.title ?? listingProduct.title,
      price: displayProduct?.price ?? listingProduct.price,
      discountedPrice:
        displayProduct?.discountedPrice ?? listingProduct.discountedPrice,
      minPrice:
        detailBounds?.minPrice ??
        firstFiniteAmount(
          listingProduct.minPrice,
          listingProduct.discountedPrice,
          listingProduct.price
        ),
      maxPrice:
        detailBounds?.maxPrice ??
        firstFiniteAmount(
          listingProduct.maxPrice,
          listingProduct.discountedPrice,
          listingProduct.price
        ),
      handle: productDetail?.handle ?? listingProduct.handle,
      variantId: selectedVariant?.id,
      variantLabel: selectedVariant
        ? formatVariantOptionLabel(
            selectedVariant.optionValues,
            productDetail?.options
          )
        : listingProduct.variantLabel,
      inStock: variantInStock,
      imgs: {
        thumbnails: images,
        previews: images,
      },
    };
  }, [
    displayProduct,
    images,
    listingProduct,
    productDetail,
    selectedVariant,
    variantInStock,
  ]);

  const { isInWishlist, toggle: toggleWishlist } = useWishlistToggle(wishlistProduct);

  useBodyScrollLock(isModalOpen);

  const storeTags = productDetail?.storeTags ?? listingProduct.storeTags;

  const customerFacingOptions = useMemo(
    () => (productDetail ? getCustomerFacingOptions(productDetail.options) : []),
    [productDetail]
  );

  const productForOptions = useMemo(() => {
    if (!productDetail) {
      return null;
    }
    return { ...productDetail, options: customerFacingOptions };
  }, [productDetail, customerFacingOptions]);

  const handlePreviewSlider = () => {
    if (displayProduct) {
      dispatch(updateproductDetails(displayProduct));
      openPreviewModal(activePreview);
    }
  };

  const handleOptionChange = (optionTitle: string, value: string) => {
    if (!productDetail) {
      return;
    }
    setLastChangedOption(optionTitle);
    setSelectedOptions((current) =>
      selectOptionValue(productDetail.variants, current, optionTitle, value)
    );
    setQuantity(1);
  };

  const handleAddToCart = () => {
    if (!selectedVariant?.id) {
      toast.error("Please select all options");
      return;
    }

    if (!variantInStock) {
      return;
    }

    const productTitle = productDetail?.title ?? listingProduct.title;
    const productHandle = productDetail?.handle ?? listingProduct.handle;

    const rollback = optimisticAddItem({
      variantId: selectedVariant.id,
      quantity,
      title: productTitle,
      thumbnail: images[0],
      unitPrice: selectedVariant.discountedPrice || selectedVariant.price,
      handle: productHandle,
    });
    startTransition(async () => {
      try {
        const result = await addToCartAction({
          quantity,
          regionId,
          variantId: selectedVariant.id,
        });
        applyCartResult(result, { mutation: "add", source: "quick_view" });
        openCartModal();
        closeModal();
      } catch {
        rollback();
        toast.error("Could not add to cart");
      }
    });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (previewOpenRef.current || target.closest(".preview-slider")) {
        return;
      }
      if (!target.closest(".modal-content")) {
        closeModal();
      }
    }

    if (isModalOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isModalOpen, closeModal]);

  useEffect(() => {
    if (!isModalOpen) {
      setQuantity(1);
      setProductDetail(null);
      setSelectedOptions({});
      setActivePreview(0);
    }
  }, [isModalOpen]);

  if (!isModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-99999 flex h-dvh items-center justify-center overflow-hidden bg-surface-inverse/70 px-4 py-5 sm:px-8 sm:py-10 xl:py-16">
      <div className="modal-content no-scrollbar relative max-h-full w-full max-w-[1100px] overflow-y-auto rounded-xl bg-white p-5 shadow-3 sm:p-7.5">
          <button
            aria-label="Close dialog"
            className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-meta text-body duration-150 ease-in hover:text-content-primary sm:top-6 sm:right-6"
            onClick={() => closeModal()}
            type="button"
          >
            <svg
              className="fill-current"
              fill="none"
              height="26"
              viewBox="0 0 26 26"
              width="26"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                clipRule="evenodd"
                d="M14.3108 13L19.2291 8.08167C19.5866 7.72417 19.5866 7.12833 19.2291 6.77083C19.0543 6.59895 18.8189 6.50262 18.5737 6.50262C18.3285 6.50262 18.0932 6.59895 17.9183 6.77083L13 11.6892L8.08164 6.77083C7.90679 6.59895 7.67142 6.50262 7.42623 6.50262C7.18104 6.50262 6.94566 6.59895 6.77081 6.77083C6.41331 7.12833 6.41331 7.72417 6.77081 8.08167L11.6891 13L6.77081 17.9183C6.41331 18.2758 6.41331 18.8717 6.77081 19.2292C7.12831 19.5867 7.72414 19.5867 8.08164 19.2292L13 14.3108L17.9183 19.2292C18.2758 19.5867 18.8716 19.5867 19.2291 19.2292C19.5866 18.8717 19.5866 18.2758 19.2291 17.9183L14.3108 13Z"
                fill=""
                fillRule="evenodd"
              />
            </svg>
          </button>

          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center text-content-muted">
              Loading product...
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-12.5">
              <div className="w-full max-w-[526px]">
                <div className="flex gap-5">
                  <div className="flex flex-col gap-5">
                    {thumbnails.map((img, key) => (
                      <button
                        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-gray-1 duration-200 ease-out hover:border-2 hover:border-action-primary-background ${
                          activePreview === key ? "border-2 border-action-primary-background" : ""
                        }`}
                        key={key}
                        onClick={() => setActivePreview(key)}
                        type="button"
                      >
                        <Image
                          alt="thumbnail"
                          className="aspect-square object-contain"
                          height={61}
                          src={img || ""}
                          width={61}
                        />
                      </button>
                    ))}
                  </div>

                  <div className="relative z-1 flex w-full items-center justify-center overflow-hidden rounded-lg border border-gray-3 bg-gray-1 sm:min-h-[508px]">
                    <ProductImageZoomButton
                      className="top-4 right-4 bg-white lg:top-8 lg:right-8"
                      onClick={handlePreviewSlider}
                      size="sm"
                    />
                    {images[activePreview] ? (
                      <Image
                        alt="product details"
                        className="object-contain"
                        height={400}
                        src={images[activePreview]}
                        width={400}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="w-full max-w-[445px]">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="font-normal text-content-primary text-xl xl:text-heading-5">
                    {productDetail?.title ?? listingProduct.title}
                  </h3>
                  {((canSeePrices && displayProduct) || storeTags?.length) ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canSeePrices && displayProduct ? (
                        <ProductSaleBadge
                          discountedPrice={displayProduct.discountedPrice}
                          price={displayProduct.price}
                        />
                      ) : null}
                      <ProductStoreTagBadges tags={storeTags} />
                    </div>
                  ) : null}
                </div>

                {/* Stock status intentionally hidden on Quick View (2026-08); restore ProductStockStatus if needed */}
                {displayProduct ? null : (
                  <div className="mb-6">
                    <p className="font-medium text-content-muted text-sm">
                      {storefrontEn.unavailableVariant}
                    </p>
                  </div>
                )}

                {productDetail?.description ? (
                  <p className="mb-6 text-content-muted">{productDetail.description}</p>
                ) : null}

                {productForOptions ? (
                  <VariantOptions
                    onChange={handleOptionChange}
                    product={productForOptions}
                    selectedOptions={selectedOptions}
                  />
                ) : null}

                {canSeePrices ? (
                  <div className="mt-6 mb-7.5 flex flex-wrap justify-between gap-5">
                    <div>
                      <h4 className="mb-3.5 font-bold text-content-primary text-lg">Price</h4>
                      {displayProduct ? (
                        <ProductPrice
                          compareClassName="font-semibold text-content-muted text-lg line-through xl:text-2xl"
                          currency={currency}
                          currentClassName="font-normal text-content-primary text-xl xl:text-heading-4"
                          discountedPrice={displayProduct.discountedPrice}
                          price={displayProduct.price}
                        />
                      ) : null}
                    </div>

                    <div>
                      <h4 className="mb-3.5 font-bold text-content-primary text-lg">Quantity</h4>
                      <ProductQuantityStepper
                        disabled={!variantInStock}
                        max={maxQuantity}
                        onDecrease={() => setQuantity(Math.max(1, quantity - 1))}
                        onIncrease={() =>
                          setQuantity(Math.min(maxQuantity, quantity + 1))
                        }
                        quantity={quantity}
                        size="lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 mb-7.5">
                    <ProductPrice
                      currency={currency}
                      discountedPrice={0}
                      loginClassName="text-lg"
                      price={0}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  {resolveAddCta(canSeePrices, persona) === "login" ? (
                    <LoginToSeePrice className="px-7 py-3 text-md" />
                  ) : (
                    <button
                      className="inline-flex rounded-md bg-action-primary-background px-7 py-3 font-bold text-white duration-200 ease-out hover:bg-action-primary-hover disabled:opacity-50"
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
                  )}

                  <WishlistButton
                    filled={isInWishlist}
                    onClick={toggleWishlist}
                    variant="text"
                  />
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default QuickViewModal;
