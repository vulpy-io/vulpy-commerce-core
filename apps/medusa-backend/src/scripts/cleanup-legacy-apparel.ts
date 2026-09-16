import type { IProductModuleService } from "@medusajs/framework/types";

export const LEGACY_APPAREL_PRODUCT_HANDLES = ["t-shirt", "sweatshirt", "sweatpants", "shorts", "priced-tee-range", "priced-tee-sale", "priced-tee-simple"] as const;
export const LEGACY_APPAREL_CATEGORY_NAMES = ["Apparel", "Merch", "Shirts", "Sweatshirts", "Pants", "Tees"] as const;
export const LEGACY_APPAREL_TAG_NAMES = ["New", "Bestseller"] as const;

interface Category {
    id: string;
    name?: string | null;
    parent_category_id?: string | null 
}
interface Tag {
    id: string;
    name?: string | null 
}

export async function cleanupLegacyApparel(productModuleService: IProductModuleService, logger: { info: (message: string) => void }): Promise<void> {
  const handles = new Set<string>(LEGACY_APPAREL_PRODUCT_HANDLES);
  const products = await productModuleService.listProducts({}, { take: null, relations: ["tags"] });
  const legacyProducts = (products ?? []).filter((product) => handles.has(product.handle) && product.handle !== "checkout-e2e-product" && product.metadata?.checkout_fixture !== true);
  if (legacyProducts.length) { await productModuleService.deleteProducts(legacyProducts.map((product) => product.id)); }

  const categories = (await productModuleService.listProductCategories({}, { take: null, select: ["id", "name", "parent_category_id"] })) as unknown as Category[];
  const names = new Set<string>(LEGACY_APPAREL_CATEGORY_NAMES);
  const stale = categories.filter((category) => names.has(category.name ?? ""));
  const staleIds = new Set(stale.map((category) => category.id));
  const depth = (category: Category): number => {
    const parent = category.parent_category_id;
    if (!(parent && staleIds.has(parent))) { return 0; }
    const parentCategory = stale.find((item) => item.id === parent);
    return parentCategory ? 1 + depth(parentCategory) : 0;
  };
  for (const category of [...stale].sort((a, b) => depth(b) - depth(a))) { await productModuleService.deleteProductCategories([category.id]); }

  const tags = (await productModuleService.listProductTags({}, { take: null })) as unknown as Tag[];
  const used = new Set((await productModuleService.listProducts({}, { take: null, relations: ["tags"] }) ?? []).flatMap((product) => (product.tags ?? []).map((tag) => tag.id)));
  const removable = tags.filter((tag) => LEGACY_APPAREL_TAG_NAMES.includes(tag.name as (typeof LEGACY_APPAREL_TAG_NAMES)[number]) && !used.has(tag.id));
  if (removable.length) { await productModuleService.deleteProductTags(removable.map((tag) => tag.id)); }
  logger.info(`[legacy-apparel] Removed ${legacyProducts.length} product(s), ${stale.length} categor(y/ies), and ${removable.length} orphan tag(s).`);
}
