export type PseudoCategoryDefinition = {
  medusaCategoryId: string;
  handle: string;
  title: string;
  route: string;
  showCategoryFilter: boolean;
  defaultSeo: {
    title: string;
    description: string;
  };
};

export const PSEUDO_CATEGORY_SALE: PseudoCategoryDefinition = {
  medusaCategoryId: "pseudo:sale",
  handle: "sale",
  title: "Sale",
  route: "/sale",
  showCategoryFilter: true,
  defaultSeo: {
    title: "Sale",
    description: "Products on sale",
  },
};

export const PSEUDO_CATEGORIES: PseudoCategoryDefinition[] = [PSEUDO_CATEGORY_SALE];

const LEADING_SLASH = /^\//;
const SLASHES = /\//g;

export function isSyntheticCategoryId(medusaCategoryId: string): boolean {
  return medusaCategoryId.startsWith("pseudo:") || medusaCategoryId.startsWith("selection:");
}

export function isSelectionCategoryId(medusaCategoryId: string): boolean {
  return medusaCategoryId.startsWith("selection:");
}

export function getPseudoCategoryByHandle(
  handle: string
): PseudoCategoryDefinition | undefined {
  return PSEUDO_CATEGORIES.find((category) => category.handle === handle);
}

export function isPseudoCategoryHandle(handle: string): boolean {
  return Boolean(getPseudoCategoryByHandle(handle));
}

export function normalizeSelectionRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function handleFromSelectionRoute(route: string): string {
  return normalizeSelectionRoute(route).replace(LEADING_SLASH, "").replace(SLASHES, "-");
}

export function getCategoryContentPath(
  handle: string,
  kind?: string,
  route?: string
): string {
  if ((kind === "pseudo" || kind === "selection") && route) {
    return normalizeSelectionRoute(route);
  }

  const pseudo = getPseudoCategoryByHandle(handle);
  if (pseudo) {
    return pseudo.route;
  }

  return `/categories/${handle}`;
}
