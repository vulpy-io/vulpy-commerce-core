import type { Product } from "./product";

export type ShopProduct = Product & {
  categoryIds: string[];
  categoryNames: string[];
  sizes: string[];
  colors: string[];
  filterableAttributes: Record<string, string>;
  minPrice: number;
  maxPrice: number;
  onSale: boolean;
};

export type CategoryFilterOption = {
  id: string;
  name: string;
  products: number;
};

export type ShopFilterFacets = {
  categories: CategoryFilterOption[];
  sizes: string[];
  colors: string[];
  /** Unique Finish option values across the catalog (swatch-backed). */
  finishes: string[];
  attributes: Record<string, string[]>;
  priceMin: number;
  priceMax: number;
};

export type ShopFilters = {
  categoryIds: string[];
  sizes: string[];
  colors: string[];
  finishes: string[];
  attributes: Record<string, string[]>;
  priceMin: number;
  priceMax: number;
  saleOnly: boolean;
};
