import type { HttpTypes } from "@medusajs/types";
import { cache } from "react";
import type { CmsCategoryContent, CmsNavItem } from "@/lib/cms/types";
import type { Category } from "@/types/category";
import type { CategoryFilterOption, } from "@/types/shop";
import { getCategoryNavAllLabel, mapStoreCategoriesToDisplay } from "./category-display";
import { categoryPagePath } from "./category-path";
import { getCategorySeo as getCategorySeoFromCms } from "./category-seo";
import { getMedusaClient } from "./client";
import { listProductCategoryMembership } from "./products";

export type MedusaCategoriesNavPlacement = "before" | "after" | "hide";

type StoreCategory = HttpTypes.StoreProductCategory;

export { categoryPagePath };

export function collectCategoryDescendantIds(category: StoreCategory): string[] {
  const ids = [category.id];

  for (const child of category.category_children ?? []) {
    ids.push(...collectCategoryDescendantIds(child));
  }

  return ids;
}

/**
 * Find categories by handle anywhere in the tree (top-level or nested).
 * Used by the categoryGrid block to curate specific tiles.
 */
export function getCategoriesByHandles(
  categories: StoreCategory[],
  handles: string[]
): StoreCategory[] {
  const wanted = new Set(handles);
  const found: StoreCategory[] = [];
  const seen = new Set<string>();

  const walk = (category: StoreCategory) => {
    if (
      category.handle &&
      wanted.has(category.handle) &&
      !seen.has(category.id)
    ) {
      seen.add(category.id);
      found.push(category);
    }
    for (const child of category.category_children ?? []) {
      walk(child);
    }
  };

  for (const category of categories) {
    walk(category);
  }

  return found;
}

export function getCategorySeo(
  category: StoreCategory,
  siteName: string,
  categoryContent?: CmsCategoryContent | null
): { title: string; description: string } {
  return getCategorySeoFromCms(category, siteName, categoryContent);
}

export type CategoryBreadcrumbItem = {
  label: string;
  href?: string;
  categoryHandle?: string;
  structuredLabel?: string;
};

function collectCategoryAncestors(category: StoreCategory): StoreCategory[] {
  const ancestors: StoreCategory[] = [];
  let current = category.parent_category;

  while (current) {
    ancestors.unshift(current);
    current = current.parent_category;
  }

  return ancestors;
}

export function buildCategoryBreadcrumb(
  category: StoreCategory
): CategoryBreadcrumbItem[] {
  const trail: CategoryBreadcrumbItem[] = collectCategoryAncestors(category).map(
    (ancestor) => ({
      label: ancestor.name ?? "",
      href: categoryPagePath(ancestor),
      categoryHandle: ancestor.handle ?? undefined,
    })
  );

  trail.push({
    label: category.name ?? "",
    categoryHandle: category.handle ?? undefined,
  });
  return trail;
}

export function buildCategoryBreadcrumbTrail(
  category: StoreCategory
): CategoryBreadcrumbItem[] {
  const trail = collectCategoryAncestors(category).map((ancestor) => ({
    label: ancestor.name ?? "",
    href: categoryPagePath(ancestor),
    categoryHandle: ancestor.handle ?? undefined,
  }));

  trail.push({
    label: category.name ?? "",
    href: categoryPagePath(category),
    categoryHandle: category.handle ?? undefined,
  });

  return trail;
}

type CategoryIndex = {
  parentById: Map<string, string | null>;
  categoryById: Map<string, StoreCategory>;
};

function buildCategoryIndex(categoryTree: StoreCategory[]): CategoryIndex {
  const parentById = new Map<string, string | null>();
  const categoryById = new Map<string, StoreCategory>();

  function walk(categories: StoreCategory[], parentId: string | null) {
    for (const category of categories) {
      parentById.set(
        category.id,
        parentId ?? category.parent_category_id ?? null
      );
      categoryById.set(category.id, category);
      walk(category.category_children ?? [], category.id);
    }
  }

  walk(categoryTree, null);
  return { parentById, categoryById };
}

function getCategoryDepth(
  categoryId: string,
  parentById: Map<string, string | null>
): number {
  let depth = 0;
  let currentId: string | null | undefined = categoryId;

  while (currentId) {
    depth++;
    currentId = parentById.get(currentId) ?? null;
  }

  return depth;
}

export function getDeepestProductCategory(
  productCategories: Pick<StoreCategory, "id">[],
  categoryTree: StoreCategory[]
): StoreCategory | null {
  if (productCategories.length === 0) {
    return null;
  }

  const { parentById, categoryById } = buildCategoryIndex(categoryTree);
  let deepest: StoreCategory | null = null;
  let maxDepth = -1;

  for (const productCategory of productCategories) {
    if (!categoryById.has(productCategory.id)) {
      continue;
    }

    const depth = getCategoryDepth(productCategory.id, parentById);
    if (depth > maxDepth) {
      maxDepth = depth;
      deepest = categoryById.get(productCategory.id) ?? null;
    }
  }

  return deepest;
}

export function buildCategoryPathTrail(
  category: StoreCategory,
  categoryTree: StoreCategory[]
): CategoryBreadcrumbItem[] {
  const { parentById, categoryById } = buildCategoryIndex(categoryTree);
  const trail: CategoryBreadcrumbItem[] = [];
  let currentId: string | null | undefined = category.id;

  while (currentId) {
    const currentCategory = categoryById.get(currentId);
    if (!currentCategory) {
      break;
    }

    trail.unshift({
      label: currentCategory.name ?? "",
      href: categoryPagePath(currentCategory),
      categoryHandle: currentCategory.handle ?? undefined,
    });
    currentId = parentById.get(currentId) ?? null;
  }

  return trail;
}

export function buildProductBreadcrumbTrail(
  productCategories: Pick<StoreCategory, "id">[],
  categoryTree: StoreCategory[],
  productTitle: string,
  categoryWithAncestors?: StoreCategory | null
): CategoryBreadcrumbItem[] {
  const deepest =
    categoryWithAncestors ??
    getDeepestProductCategory(productCategories, categoryTree);

  const categoryTrail = deepest
    ? categoryWithAncestors
      ? buildCategoryBreadcrumbTrail(deepest)
      : buildCategoryPathTrail(deepest, categoryTree)
    : [];

  return [...categoryTrail, { label: productTitle }];
}

export function buildChildCategoryFacets(
  category: StoreCategory,
  products: Array<{ categoryIds: string[] }>,
  productCategoryIds: Set<string>
): CategoryFilterOption[] {
  return getVisibleChildCategories(category, productCategoryIds).map((child) => {
      const scopeIds = new Set(collectCategoryDescendantIds(child));
      const count = products.filter((product) =>
        product.categoryIds.some((id) => scopeIds.has(id))
      ).length;

      return {
        id: child.id,
        name: child.name ?? "",
        products: count,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getVisibleChildCategories(
  category: StoreCategory,
  productCategoryIds: Set<string>
): StoreCategory[] {
  return (category.category_children ?? []).filter((child) =>
    categoryHasProducts(child, productCategoryIds)
  );
}

export function buildChildCategoryDisplay(
  category: StoreCategory,
  productCategoryIds: Set<string>
): Category[] {
  return mapStoreCategoriesToDisplay(
    getVisibleChildCategories(category, productCategoryIds)
  );
}

export function categoryHasProducts(
  category: StoreCategory,
  productCategoryIds: Set<string>
): boolean {
  if (productCategoryIds.has(category.id)) {
    return true;
  }

  return (category.category_children ?? []).some((child) =>
    categoryHasProducts(child, productCategoryIds)
  );
}

export function getTopLevelNavCategories(categories: StoreCategory[]): StoreCategory[] {
  const nestedChildIds = new Set<string>();

  for (const category of categories) {
    for (const childId of collectCategoryDescendantIds(category)) {
      if (childId !== category.id) {
        nestedChildIds.add(childId);
      }
    }
  }

  return categories.filter(
    (category) => !(category.parent_category_id || nestedChildIds.has(category.id))
  );
}

export function getOrderedTopLevelCategories(
  categories: StoreCategory[],
  productCategoryIds: Set<string>
): StoreCategory[] {
  return getTopLevelNavCategories(categories).filter((category) =>
    categoryHasProducts(category, productCategoryIds)
  );
}

function collectSubmenuItems(
  category: StoreCategory,
  productCategoryIds: Set<string>,
  nextId: () => number
): CmsNavItem[] {
  const items: CmsNavItem[] = [];

  for (const child of category.category_children ?? []) {
    if (!categoryHasProducts(child, productCategoryIds)) {
      continue;
    }

    const childSubmenu = collectSubmenuItems(child, productCategoryIds, nextId);

    if (childSubmenu.length > 0) {
      // Child has visible grandchildren — emit as a nested submenu item with
      // an "All {child}" entry prepended (mirrors the 2nd-level pattern).
      items.push({
        id: nextId(),
        title: child.name ?? "",
        path: categoryPagePath(child),
        newTab: false,
        submenu: [
          {
            id: nextId(),
            title: getCategoryNavAllLabel(child),
            path: categoryPagePath(child),
            newTab: false,
            mobileOnly: true,
          },
          ...childSubmenu,
        ],
      });
      continue;
    }

    items.push({
      id: nextId(),
      title: child.name ?? "",
      path: categoryPagePath(child),
      newTab: false,
    });
  }

  return items;
}

export function buildCategoryNavItems(
  categories: StoreCategory[],
  productCategoryIds: Set<string>,
  startId = 10_000
): CmsNavItem[] {
  let idCounter = startId;
  const nextId = () => idCounter++;

  const items: CmsNavItem[] = [];
  const topLevelCategories = getOrderedTopLevelCategories(
    categories,
    productCategoryIds
  );

  for (const category of topLevelCategories) {
    const submenu = collectSubmenuItems(category, productCategoryIds, nextId);

    if (submenu.length > 0) {
      items.push({
        id: nextId(),
        title: category.name ?? "",
        path: categoryPagePath(category),
        newTab: false,
        submenu: [
          {
            id: nextId(),
            title: getCategoryNavAllLabel(category),
            path: categoryPagePath(category),
            newTab: false,
            mobileOnly: true,
          },
          ...submenu,
        ],
      });
      continue;
    }

    items.push({
      id: nextId(),
      title: category.name ?? "",
      path: categoryPagePath(category),
      newTab: false,
    });
  }

  return items;
}

export function mergeNavigationWithCategories(
  customItems: CmsNavItem[],
  categoryItems: CmsNavItem[],
  placement: MedusaCategoriesNavPlacement
): CmsNavItem[] {
  if (placement === "hide" || categoryItems.length === 0) {
    return customItems;
  }

  if (placement === "after") {
    return [...customItems, ...categoryItems];
  }

  return [...categoryItems, ...customItems];
}

export const getCategoryByHandle = cache(async (handle: string) => {
  const medusa = await getMedusaClient();
  const { product_categories } = await medusa.store.category.list({
    handle,
    include_descendants_tree: true,
    include_ancestors_tree: true,
    fields: "+metadata",
    limit: 1,
  });

  return product_categories[0] ?? null;
});

export const listCategoryTree = cache(async () => {
  const medusa = await getMedusaClient();
  const { product_categories } = await medusa.store.category.list({
    parent_category_id: null,
    include_descendants_tree: true,
    fields: "+metadata",
    limit: 100,
  });

  return product_categories;
});

export const getProductCategoryIds = cache(async (regionId: string) => {
  if (!regionId) {
    return new Set<string>();
  }

  const { products } = await listProductCategoryMembership(regionId, 200);
  const ids = new Set<string>();

  for (const product of products) {
    for (const category of product.categories ?? []) {
      ids.add(category.id);
    }
  }

  return ids;
});

export const getCategoryNavigationItems = cache(async (regionId: string) => {
  const [categories, productCategoryIds] = await Promise.all([
    listCategoryTree(),
    getProductCategoryIds(regionId),
  ]);

  return buildCategoryNavItems(categories, productCategoryIds);
});

export const getSearchCategories = cache(async (regionId: string) => {
  const [categories, productCategoryIds] = await Promise.all([
    listCategoryTree(),
    getProductCategoryIds(regionId),
  ]);

  return [
    { label: "All categories", value: "0" },
    ...getOrderedTopLevelCategories(categories, productCategoryIds).map(
      (category) => ({
        label: category.name ?? "",
        value: category.id,
      })
    ),
  ];
});
