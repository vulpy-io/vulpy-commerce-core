import type { HttpTypes } from "@medusajs/types";
import type { Category } from "@/types/category";
import { resolveMedusaAssetUrl } from "./asset-url";

export const CATEGORY_IMAGE_METADATA_KEY = "image_url";
/** Optional "All …" label for top-level category nav dropdowns. */
export const CATEGORY_NAV_ALL_LABEL_METADATA_KEY = "nav_all_label";

type StoreCategory = HttpTypes.StoreProductCategory;

export function resolveCategoryImageUrl(url: string | null | undefined): string | null {
  return resolveMedusaAssetUrl(url);
}

export function getCategoryNavAllLabel(
  category: Pick<StoreCategory, "name" | "metadata">
): string {
  const metadata = (category.metadata ?? {}) as Record<string, string>;
  const custom = metadata[CATEGORY_NAV_ALL_LABEL_METADATA_KEY]?.trim();

  if (custom) {
    return custom;
  }

  const name = category.name?.trim();
  return name ? `All ${name}` : "All";
}

export function getCategoryImageUrl(
  category: Pick<StoreCategory, "metadata">
): string | null {
  const metadata = (category.metadata ?? {}) as Record<string, string>;
  const imageUrl = metadata[CATEGORY_IMAGE_METADATA_KEY];

  return resolveCategoryImageUrl(imageUrl);
}

export function mapStoreCategoryToDisplay(
  category: Pick<StoreCategory, "id" | "name" | "handle" | "metadata">,
  index: number
): Category {
  return {
    id: index + 1,
    medusaId: category.id,
    title: category.name ?? "",
    img: getCategoryImageUrl(category),
    handle: category.handle,
  };
}

export function mapStoreCategoriesToDisplay(
  categories: Pick<StoreCategory, "id" | "name" | "handle" | "metadata">[]
): Category[] {
  return categories.map((category, index) => mapStoreCategoryToDisplay(category, index));
}
