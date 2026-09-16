"use client";

import LoginToSeePrice from "@/components/Product/LoginToSeePrice";
import { useCanSeePrices } from "@/context/AuthContext";
import { formatPrice } from "@/lib/medusa/money";

/** Cart/checkout amounts — never “From”; respects B2B price gate. */
const GatedAmount = ({
  amount,
  currency,
  className = "text-content-primary",
  loginClassName,
}: {
  amount: number;
  currency: string;
  className?: string;
  loginClassName?: string;
}) => {
  const canSeePrices = useCanSeePrices();

  if (!canSeePrices) {
    return <LoginToSeePrice className={loginClassName ?? className} />;
  }

  return <span className={className}>{formatPrice(amount, currency)}</span>;
};

export default GatedAmount;
