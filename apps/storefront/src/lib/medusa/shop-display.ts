import type { Product } from "@/types/product";
import { firstFiniteAmount } from "./money";
import { getShopPageSize } from "./shop-config";

export type ShopSortValue =
  | "latest"
  | "oldest"
  | "bestsellers"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "name-desc";

export const SHOP_SORT_VALUES: ShopSortValue[] = [
  "latest",
  "oldest",
  "bestsellers",
  "price-asc",
  "price-desc",
  "name-asc",
  "name-desc",
];

export const DEFAULT_SORT_LABELS: Record<ShopSortValue, string> = {
  latest: "New arrivals",
  oldest: "Oldest products",
  bestsellers: "Bestsellers",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "name-asc": "Name: A–Z",
  "name-desc": "Name: Z–A",
};

function productMinPrice(product: Product) {
  return firstFiniteAmount(
    product.minPrice,
    product.discountedPrice,
    product.price
  );
}

function productMaxPrice(product: Product) {
  return firstFiniteAmount(
    product.maxPrice,
    product.discountedPrice,
    product.price
  );
}

function productCreatedAt(product: Product) {
  return product.createdAt ? Date.parse(product.createdAt) : 0;
}

function productSalesCount(product: Product) {
  return product.salesCount ?? 0;
}

export function toMedusaProductOrder(sort: ShopSortValue) {
  switch (sort) {
    case "latest":
      return "-created_at";
    case "oldest":
      return "created_at";
    case "name-asc":
      return "title";
    case "name-desc":
      return "-title";
    default:
      return undefined;
  }
}

export function sortRequiresServerPostProcess(sort: ShopSortValue) {
  return sort === "bestsellers" || sort === "price-asc" || sort === "price-desc";
}

export function normalizeShopSort(value?: string): ShopSortValue {
  if (value === "featured") {
    return "latest";
  }

  if (
    value === "latest" ||
    value === "oldest" ||
    value === "bestsellers" ||
    value === "price-asc" ||
    value === "price-desc" ||
    value === "name-asc" ||
    value === "name-desc"
  ) {
    return value;
  }

  return "latest";
}

export function getShopSortLabel(
  value: ShopSortValue,
  cmsLabels?: Partial<Record<ShopSortValue, string>>
) {
  return cmsLabels?.[value]?.trim() || DEFAULT_SORT_LABELS[value];
}

export function deprioritizeOutOfStockProducts<T extends Product>(products: T[]): T[] {
  const inStock: T[] = [];
  const outOfStock: T[] = [];

  for (const product of products) {
    if (product.inStock === false) {
      outOfStock.push(product);
    } else {
      inStock.push(product);
    }
  }

  return [...inStock, ...outOfStock];
}

export function sortShopProducts<T extends Product>(products: T[], sort: ShopSortValue) {
  const sorted = [...products];

  switch (sort) {
    case "latest":
      sorted.sort((a, b) => productCreatedAt(b) - productCreatedAt(a));
      break;
    case "oldest":
      sorted.sort((a, b) => productCreatedAt(a) - productCreatedAt(b));
      break;
    case "bestsellers":
      sorted.sort((a, b) => {
        const salesDiff = productSalesCount(b) - productSalesCount(a);
        if (salesDiff !== 0) {
          return salesDiff;
        }

        return productCreatedAt(b) - productCreatedAt(a);
      });
      break;
    case "price-asc":
      sorted.sort((a, b) => productMinPrice(a) - productMinPrice(b));
      break;
    case "price-desc":
      sorted.sort((a, b) => productMaxPrice(b) - productMaxPrice(a));
      break;
    case "name-asc":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.title.localeCompare(a.title));
      break;
    default:
      break;
  }

  return deprioritizeOutOfStockProducts(sorted);
}

export function paginateShopProducts<T>(
  products: T[],
  page: number,
  pageSize = getShopPageSize()
) {
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    products: products.slice(start, start + pageSize),
  };
}
