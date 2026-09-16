import { describe, expect, it } from "vitest";
import {
  getCategoryContentPath,
  handleFromSelectionRoute,
  isPseudoCategoryHandle,
  isSelectionCategoryId,
  isSyntheticCategoryId,
  normalizeSelectionRoute,
  PSEUDO_CATEGORY_SALE,
} from "./pseudo-categories";

describe("pseudo-categories", () => {
  it("recognises the sale handle", () => {
    expect(isPseudoCategoryHandle("sale")).toBe(true);
    expect(isPseudoCategoryHandle("shirts")).toBe(false);
  });

  it("maps sale to /sale storefront path", () => {
    expect(getCategoryContentPath(PSEUDO_CATEGORY_SALE.handle)).toBe("/sale");
    expect(getCategoryContentPath("shirts")).toBe("/categories/shirts");
  });

  it("maps selection routes to custom paths", () => {
    expect(
      getCategoryContentPath("women-rackets", "selection", "/women-rackets")
    ).toBe("/women-rackets");
    expect(handleFromSelectionRoute("/women-rackets")).toBe("women-rackets");
    expect(normalizeSelectionRoute("women-rackets")).toBe("/women-rackets");
  });

  it("recognises synthetic category ids", () => {
    expect(isSyntheticCategoryId("pseudo:sale")).toBe(true);
    expect(isSelectionCategoryId("selection:abc")).toBe(true);
    expect(isSyntheticCategoryId("pcat_123")).toBe(false);
  });
});
