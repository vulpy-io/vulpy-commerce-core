import { describe, expect, it } from "vitest";
import {
  hasCatalogQueryParams,
  isFirstPageParam,
  isPaginatedRequest,
  readRawPage,
} from "./catalog-params";

describe("catalog-params", () => {
  it("readRawPage reads the first value of array params", () => {
    expect(readRawPage({ page: ["2", "3"] })).toBe("2");
    expect(readRawPage({ page: "4" })).toBe("4");
    expect(readRawPage({})).toBeUndefined();
    expect(readRawPage()).toBeUndefined();
  });

  it("isFirstPageParam treats absent or page=1 as first page", () => {
    expect(isFirstPageParam()).toBe(true);
    expect(isFirstPageParam({})).toBe(true);
    expect(isFirstPageParam({ page: "1" })).toBe(true);
  });

  it("isFirstPageParam treats any other page value as a deep page", () => {
    expect(isFirstPageParam({ page: "2" })).toBe(false);
    expect(isFirstPageParam({ page: "0" })).toBe(false);
    expect(isFirstPageParam({ page: "abc" })).toBe(false);
  });

  it("isPaginatedRequest mirrors isFirstPageParam", () => {
    expect(isPaginatedRequest({ page: "2" })).toBe(true);
    expect(isPaginatedRequest()).toBe(false);
    expect(isPaginatedRequest({ page: "1" })).toBe(false);
  });

  describe("hasCatalogQueryParams", () => {
    it("is false when params are absent or empty", () => {
      expect(hasCatalogQueryParams()).toBe(false);
      expect(hasCatalogQueryParams({})).toBe(false);
    });

    it("ignores blank page=1 — the clean-URL form of the first page", () => {
      expect(hasCatalogQueryParams({ page: "1" })).toBe(false);
      expect(hasCatalogQueryParams({ page: ["1"] })).toBe(false);
    });

    it("is true for any non-page param (filters, sort, …)", () => {
      expect(hasCatalogQueryParams({ sort: "price-asc" })).toBe(true);
      expect(hasCatalogQueryParams({ finishes: "Chrome" })).toBe(true);
      expect(hasCatalogQueryParams({ attr_material: ["bronze"] })).toBe(true);
      // Blank strings still count as an explicit query.
      expect(hasCatalogQueryParams({ sort: "" })).toBe(true);
    });

    it("is true when page is anything other than the blank '1'", () => {
      expect(hasCatalogQueryParams({ page: "2" })).toBe(true);
      expect(hasCatalogQueryParams({ page: "abc" })).toBe(true);
    });
  });
});