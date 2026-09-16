"use client";

import LoginToSeePrice from "@/components/Product/LoginToSeePrice";
import ProductPrice from "@/components/Product/ProductPrice";
import { useCanSeePrices, usePricePersona } from "@/context/AuthContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useAddToCart } from "@/hooks/useAddToCart";
import { quotationEn } from "@/i18n/quotation";
import { PRODUCT_PLACEHOLDER_IMAGE } from "@/lib/medusa/asset-url";
import { resolveAddCta } from "@/lib/medusa/persona";
import ProductSummary from "./ProductSummary";
import type { SavedProductListItem } from "./types";

const RemoveButton = ({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) => (
  <button
    aria-label={ariaLabel}
    className="inline-flex size-9.5 shrink-0 items-center justify-center rounded-lg border border-gray-3 bg-gray-2 px-2 py-2 duration-200 ease-out hover:border-red-light-4 hover:bg-red-light-6 hover:text-status-danger"
    onClick={onClick}
    type="button"
  >
    <svg
      className="fill-current"
      fill="none"
      height="22"
      viewBox="0 0 22 22"
      width="22"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.19509 8.22222C8.92661 7.95374 8.49131 7.95374 8.22282 8.22222C7.95433 8.49071 7.95433 8.92601 8.22282 9.1945L10.0284 11L8.22284 12.8056C7.95435 13.074 7.95435 13.5093 8.22284 13.7778C8.49133 14.0463 8.92663 14.0463 9.19511 13.7778L11.0006 11.9723L12.8061 13.7778C13.0746 14.0463 13.5099 14.0463 13.7784 13.7778C14.0469 13.5093 14.0469 13.074 13.7784 12.8055L11.9729 11L13.7784 9.19451C14.0469 8.92603 14.0469 8.49073 13.7784 8.22224C13.5099 7.95376 13.0746 7.95376 12.8062 8.22224L11.0006 10.0278L9.19509 8.22222Z"
        fill=""
      />
      <path
        clipRule="evenodd"
        d="M11.0007 1.14587C5.55835 1.14587 1.14648 5.55773 1.14648 11C1.14648 16.4423 5.55835 20.8542 11.0007 20.8542C16.443 20.8542 20.8548 16.4423 20.8548 11C20.8548 5.55773 16.443 1.14587 11.0007 1.14587ZM2.52148 11C2.52148 6.31713 6.31774 2.52087 11.0007 2.52087C15.6836 2.52087 19.4798 6.31713 19.4798 11C19.4798 15.683 15.6836 19.4792 11.0007 19.4792C6.31774 19.4792 2.52148 15.683 2.52148 11Z"
        fill=""
        fillRule="evenodd"
      />
    </svg>
  </button>
);

const AddToCartButton = ({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    className="inline-flex whitespace-nowrap rounded-md border border-gray-3 bg-gray-1 px-6 py-2.5 text-content-primary duration-200 ease-out hover:border-gray-3 hover:bg-action-primary-background hover:text-white disabled:opacity-50"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {label}
  </button>
);

function getProductHref(item: SavedProductListItem) {
  return item.handle ? `/products/${item.handle}` : "/shop";
}

function getPreviewImage(item: SavedProductListItem) {
  return item.imgs?.thumbnails?.[0] ?? PRODUCT_PLACEHOLDER_IMAGE;
}

export default function SavedProductRow({
  item,
  regionId,
  variant = "table",
  removeAriaLabel,
  onRemove,
  addToCartLabel = "Add to cart",
  onAddToCartSuccess,
}: {
  item: SavedProductListItem;
  regionId: string;
  variant?: "table" | "card";
  removeAriaLabel: string;
  onRemove: () => void;
  addToCartLabel?: string;
  onAddToCartSuccess?: () => void;
}) {
  const { addToCart, isPending } = useAddToCart();
  const canSeePrices = useCanSeePrices();
  const persona = usePricePersona();
  const currency = useStoreCurrency();

  const productUrl = getProductHref(item);
  const previewImage = getPreviewImage(item);
  const inStock = item.status !== "out_of_stock";
  // Guests (B2C) get the quotation-bag action; trade customers get the cart label.
  const actionLabel = canSeePrices ? addToCartLabel : quotationEn.addToQuotation;
  const addCta = resolveAddCta(canSeePrices, persona);

  const handleAddToCart = () => {
    if (!inStock) {
      return;
    }

    addToCart(
      {
        ...item,
        reviews: 0,
        variantId: item.variantId ?? item.id,
      },
      1,
      { regionId, onSuccess: onAddToCartSuccess }
    );
  };

  if (variant === "card") {
    return (
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-start gap-4">
          <RemoveButton ariaLabel={removeAriaLabel} onClick={onRemove} />
          <ProductSummary
            href={productUrl}
            image={previewImage}
            title={item.title}
            variantLabel={item.variantLabel}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pl-[54px]">
          {canSeePrices && item.price > 0 ? (
            <ProductPrice
              currency={currency}
              discountedPrice={item.discountedPrice}
              price={item.price}
            />
          ) : null}
          {addCta === "login" ? (
            <LoginToSeePrice className="px-6 py-2.5 text-custom-sm" />
          ) : (
            <AddToCartButton
              disabled={isPending || !inStock}
              label={actionLabel}
              onClick={handleAddToCart}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <tr className="border-gray-3 border-t">
      <td className="px-10 py-5 align-middle">
        <RemoveButton ariaLabel={removeAriaLabel} onClick={onRemove} />
      </td>
      <td className="px-4 py-5 align-middle">
        <ProductSummary
          href={productUrl}
          image={previewImage}
          title={item.title}
          variantLabel={item.variantLabel}
        />
      </td>
      {canSeePrices && item.price > 0 ? (
        <td className="px-4 py-5 text-center align-middle">
          <ProductPrice
            currency={currency}
            discountedPrice={item.discountedPrice}
            price={item.price}
          />
        </td>
      ) : null}
      <td className="px-10 py-5 text-center align-middle">
        {addCta === "login" ? (
          <LoginToSeePrice className="px-6 py-2.5 text-custom-sm" />
        ) : (
          <AddToCartButton
            disabled={isPending || !inStock}
            label={actionLabel}
            onClick={handleAddToCart}
          />
        )}
      </td>
    </tr>
  );
}