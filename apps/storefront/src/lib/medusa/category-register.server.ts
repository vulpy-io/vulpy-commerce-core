import type { HttpTypes } from "@medusajs/types";
import { cache } from "react";
import config from "@/config";
import type { Product } from "@/types/product";
import {
  collectCategoryDescendantIds,
  getCategoryByHandle,
  getProductCategoryIds,
} from "./categories";
import { getCategoryImageUrl } from "./category-display";
import { mapMedusaProductToProduct } from "./mappers";
import { listProductsByCategoryIds } from "./products";
import { getRegion } from "./regions";
import { buildRegisterChildren, type RegisterChild } from "./register-model";

/** Sample cards shown per register collection plate. */
const SAMPLE_PRODUCTS_PER_COLLECTION = 2;

export type CategoryRegisterCollection = {
  child: RegisterChild;
  /** Number of products in the collection's descendant scope. */
  productCount: number;
  image: string | null;
  description: string | null;
  sampleProducts: Product[];
};

export type CategoryRegisterPage = {
  category: HttpTypes.StoreProductCategory;
  regionId: string;
  children: CategoryRegisterCollection[];
};

/**
 * Server loader for the editorial Register listing (top-level categories
 * with >= 2 product-bearing children). Returns `null` when the category is
 * missing or has fewer than 2 product-bearing children — the caller then
 * falls back to the standard ShopWithSidebar listing.
 */
export const getCategoryRegisterPage = cache(
  async (handle: string): Promise<CategoryRegisterPage | null> => {
    const [category, region] = await Promise.all([
      getCategoryByHandle(handle),
      getRegion(config.defaultCountryCode),
    ]);

    if (!(category && region?.id)) {
      return null;
    }

    const productCategoryIds = await getProductCategoryIds(region.id);
    const children = buildRegisterChildren(category, productCategoryIds).filter(
      (child) => Boolean(child.handle) && child.count > 0
    );

    if (children.length < 2) {
      return null;
    }

    const currencyCode = region.currency_code ?? undefined;
    const childrenByHandle = new Map(
      (category.category_children ?? []).map((child) => [child.handle, child])
    );

    const collections = await Promise.all(
      children.map(async (child) => {
        const childCategory = childrenByHandle.get(child.handle) ?? null;
        const descendantIds = childCategory
          ? collectCategoryDescendantIds(childCategory)
          : [];

        const { products, count } = await listProductsByCategoryIds(
          region.id,
          descendantIds,
          SAMPLE_PRODUCTS_PER_COLLECTION
        );

        return {
          child,
          productCount: count,
          image: childCategory ? getCategoryImageUrl(childCategory) : null,
          description: childCategory?.description?.trim() || null,
          sampleProducts: products
            .map((product) =>
              mapMedusaProductToProduct(product, undefined, currencyCode)
            )
            .filter((product): product is Product => product !== null)
            .slice(0, SAMPLE_PRODUCTS_PER_COLLECTION),
        };
      })
    );

    return {
      category,
      regionId: region.id,
      children: collections,
    };
  }
);