export type ShopSortValue =
  | "latest"
  | "oldest"
  | "bestsellers"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "name-desc";

export interface SortableStoreProduct {
  id?: string;
  title: string;
  created_at?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  variants?: Array<{
    calculated_price?: {
      calculated_amount?: number | null;
    } | null;
    manage_inventory?: boolean | null;
    inventory_quantity?: number | null;
  }> | null;
}

function productCreatedAt(product: SortableStoreProduct) {
  if (!product.created_at) {
    return 0;
  }

  const timestamp = Date.parse(String(product.created_at));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function productSalesCount(product: SortableStoreProduct) {
  const raw = product.metadata?.sales_count;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function productPrice(product: SortableStoreProduct) {
  const variant = product.variants?.[0];
  return variant?.calculated_price?.calculated_amount ?? 0;
}

function isProductInStock(product: SortableStoreProduct) {
  const variants = product.variants ?? [];
  if (!variants.length) {
    return false;
  }

  return variants.some((variant) => {
    if (!variant.manage_inventory) {
      return true;
    }

    return (variant.inventory_quantity ?? 0) > 0;
  });
}

function deprioritizeOutOfStockProducts<T extends SortableStoreProduct>(products: T[]) {
  const inStock: T[] = [];
  const outOfStock: T[] = [];

  for (const product of products) {
    if (isProductInStock(product)) {
      inStock.push(product);
    } else {
      outOfStock.push(product);
    }
  }

  return [...inStock, ...outOfStock];
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
  return (
    sort === "bestsellers" ||
    sort === "price-asc" ||
    sort === "price-desc"
  );
}

export function sortStoreProducts<T extends SortableStoreProduct>(
  products: T[],
  sort: ShopSortValue
) {
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
      sorted.sort((a, b) => productPrice(a) - productPrice(b));
      break;
    case "price-desc":
      sorted.sort((a, b) => productPrice(b) - productPrice(a));
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

export function finalizeStoreProductOrder<T extends SortableStoreProduct>(
  products: T[],
  sort: ShopSortValue
) {
  return sortStoreProducts(products, sort);
}
