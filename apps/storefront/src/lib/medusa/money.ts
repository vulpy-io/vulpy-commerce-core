/**
 * Medusa v2 store API amounts are in major currency units
 * (e.g. calculated_amount: 10 → $10.00), not minor units/cents.
 */
export function roundPriceAmount(amount: number, _currencyCode: string) {
  return amount;
}

export function fromMedusaAmount(
  amount?: number | null,
  currencyCode?: string
) {
  const value = amount ?? 0;
  return currencyCode ? roundPriceAmount(value, currencyCode) : value;
}

export function formatPrice(amount: number, currencyCode: string) {
  const code = currencyCode?.toUpperCase();
  // Guard against falsy currency codes from Medusa region fallback
  // (Medusa unreachable → getStoreRegion returns { currencyCode: "" }).
  if (!code) {
    return "";
  }
  const rounded = roundPriceAmount(amount, currencyCode);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
  }).format(rounded);
}

/** Listing “from” copy when variant prices differ. */
export function formatFromPrice(amount: number, currencyCode: string) {
  return `From ${formatPrice(amount, currencyCode)}`;
}

export function hasPriceRange(minPrice?: number, maxPrice?: number) {
  if (minPrice == null || maxPrice == null) {
    return false;
  }

  return minPrice < maxPrice;
}

/** Prefer the first finite number (including 0); never treat 0 as missing. */
export function firstFiniteAmount(
  ...values: Array<number | null | undefined>
): number {
  for (const value of values) {
    if (value != null && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

export function getPriceBounds(amounts: number[]): {
  minPrice: number;
  maxPrice: number;
} {
  const finite = amounts.filter((amount) => Number.isFinite(amount));
  if (finite.length === 0) {
    return { minPrice: 0, maxPrice: 0 };
  }

  return {
    minPrice: Math.min(...finite),
    maxPrice: Math.max(...finite),
  };
}

export type ProductPriceDisplay =
  | { kind: "from"; amount: number }
  | { kind: "sale"; amount: number; compareAt: number }
  | { kind: "single"; amount: number };

/**
 * Pure listing/catalog price display rules (no auth).
 * Pass equal min/max (or omit) for selected-variant surfaces so “From” never appears.
 */
export function resolveProductPriceDisplay(input: {
  price: number;
  discountedPrice: number;
  minPrice?: number;
  maxPrice?: number;
}): ProductPriceDisplay {
  const current = firstFiniteAmount(input.discountedPrice, input.price);
  const min = firstFiniteAmount(input.minPrice, current);
  const max = firstFiniteAmount(input.maxPrice, current);

  if (hasPriceRange(min, max)) {
    return { kind: "from", amount: min };
  }

  if (input.price > current) {
    return { kind: "sale", amount: current, compareAt: input.price };
  }

  return { kind: "single", amount: current };
}

export function getCurrencySymbol(currencyCode: string) {
  if (!currencyCode) { return "$"; }
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0);

  return parts.find((part) => part.type === "currency")?.value ?? "$";
}
