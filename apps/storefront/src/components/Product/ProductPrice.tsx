"use client";

import LoginToSeePrice from "@/components/Product/LoginToSeePrice";
import { useCanSeePrices } from "@/context/AuthContext";
import {
  formatFromPrice,
  formatPrice,
  resolveProductPriceDisplay,
} from "@/lib/medusa/money";

type ProductPriceProps = {
  price: number;
  discountedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  currency: string;
  className?: string;
  currentClassName?: string;
  compareClassName?: string;
  loginClassName?: string;
  /** When false, skip AuthContext and treat as gated (tests / forced). */
  canSeePrices?: boolean;
};

const ProductPrice = ({
  price,
  discountedPrice,
  minPrice,
  maxPrice,
  currency,
  className = "",
  currentClassName = "text-content-primary",
  compareClassName = "text-content-muted line-through",
  loginClassName = "",
  canSeePrices: canSeePricesProp,
}: ProductPriceProps) => {
  const canSeePricesHook = useCanSeePrices();
  const canSeePrices = canSeePricesProp ?? canSeePricesHook;

  if (!canSeePrices) {
    return <LoginToSeePrice className={loginClassName || className} />;
  }

  const display = resolveProductPriceDisplay({
    price,
    discountedPrice,
    minPrice,
    maxPrice,
  });

  if (display.kind === "from") {
    return (
      <span className={className}>
        <span className={currentClassName}>
          {formatFromPrice(display.amount, currency)}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <span className={currentClassName}>
        {formatPrice(display.amount, currency)}
      </span>
      {display.kind === "sale" ? (
        <span className={compareClassName}>
          {formatPrice(display.compareAt, currency)}
        </span>
      ) : null}
    </span>
  );
};

export default ProductPrice;
