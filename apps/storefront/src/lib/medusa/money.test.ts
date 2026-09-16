import { describe, expect, it } from "vitest";
import {
  firstFiniteAmount,
  formatFromPrice,
  formatPrice,
  fromMedusaAmount,
  getPriceBounds,
  hasPriceRange,
  resolveProductPriceDisplay,
  roundPriceAmount,
} from "./money";

describe("roundPriceAmount", () => {
  it("leaves amounts unchanged", () => {
    expect(roundPriceAmount(10.49, "eur")).toBe(10.49);
    expect(roundPriceAmount(10.5, "eur")).toBe(10.5);
  });
});

describe("fromMedusaAmount", () => {
  it("returns the incoming amount as-is", () => {
    expect(fromMedusaAmount(10)).toBe(10);
    expect(fromMedusaAmount(2.99, "eur")).toBe(2.99);
  });

  it("falls back to zero when amount is nullish", () => {
    expect(fromMedusaAmount(undefined)).toBe(0);
    expect(fromMedusaAmount(null)).toBe(0);
  });
});

describe("formatPrice", () => {
  it("formats amounts using en-US locale", () => {
    expect(formatPrice(10, "eur")).toBe("€10.00");
  });

  it("supports different currency codes", () => {
    expect(formatPrice(12, "usd")).toBe("$12.00");
  });

  it("returns empty string for empty currency code", () => {
    expect(formatPrice(10, "")).toBe("");
  });
});

describe("formatFromPrice", () => {
  it("prefixes formatted currency with From", () => {
    expect(formatFromPrice(12, "usd")).toBe("From $12.00");
  });

  it("keeps a free amount as From $0.00", () => {
    expect(formatFromPrice(0, "usd")).toBe("From $0.00");
  });
});

describe("hasPriceRange", () => {
  it("is true only when min is strictly less than max", () => {
    expect(hasPriceRange(12, 16)).toBe(true);
    expect(hasPriceRange(10, 10)).toBe(false);
    expect(hasPriceRange(undefined, 10)).toBe(false);
    expect(hasPriceRange(0, 10)).toBe(true);
  });
});

describe("firstFiniteAmount", () => {
  it("prefers the first finite value including zero", () => {
    expect(firstFiniteAmount(0, 12)).toBe(0);
    expect(firstFiniteAmount(undefined, null, 12)).toBe(12);
    expect(firstFiniteAmount(Number.NaN, 8)).toBe(8);
  });
});

describe("getPriceBounds", () => {
  it("returns zeros for an empty list", () => {
    expect(getPriceBounds([])).toEqual({ minPrice: 0, maxPrice: 0 });
  });

  it("includes free variants in the range", () => {
    expect(getPriceBounds([0, 16])).toEqual({ minPrice: 0, maxPrice: 16 });
  });
});

describe("resolveProductPriceDisplay", () => {
  it("returns From when min is less than max", () => {
    expect(
      resolveProductPriceDisplay({
        price: 16,
        discountedPrice: 12,
        minPrice: 12,
        maxPrice: 16,
      })
    ).toEqual({ kind: "from", amount: 12 });
  });

  it("returns sale when prices are equal across variants but discounted", () => {
    expect(
      resolveProductPriceDisplay({
        price: 18,
        discountedPrice: 12,
        minPrice: 12,
        maxPrice: 12,
      })
    ).toEqual({ kind: "sale", amount: 12, compareAt: 18 });
  });

  it("returns a single price when not on sale", () => {
    expect(
      resolveProductPriceDisplay({
        price: 15,
        discountedPrice: 15,
      })
    ).toEqual({ kind: "single", amount: 15 });
  });

  it("never shows From when min/max are omitted for selected-variant surfaces", () => {
    expect(
      resolveProductPriceDisplay({
        price: 16,
        discountedPrice: 16,
      })
    ).toEqual({ kind: "single", amount: 16 });
  });

  it("keeps a free current price", () => {
    expect(
      resolveProductPriceDisplay({
        price: 10,
        discountedPrice: 0,
        minPrice: 0,
        maxPrice: 0,
      })
    ).toEqual({ kind: "sale", amount: 0, compareAt: 10 });
  });
});
