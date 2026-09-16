import type { HttpTypes } from "@medusajs/types";
import type { CmsCategoryContent } from "@/lib/cms/types";
import { formatSeoTitle } from "@/lib/seo/format-seo-title";

function getCategorySeoTitle(
  categoryContent: CmsCategoryContent | null | undefined,
  categoryTitle: string
): string {
  return (
    categoryContent?.seo?.title?.trim() ||
    categoryContent?.h1?.trim() ||
    categoryContent?.title?.trim() ||
    categoryTitle.trim()
  );
}

export function getPseudoCategoryHeading(
  categoryContent: CmsCategoryContent | null | undefined,
  fallbackTitle: string
): string {
  return (
    categoryContent?.h1?.trim() ||
    categoryContent?.title?.trim() ||
    fallbackTitle
  );
}

export function getPseudoCategorySeo(
  categoryContent: CmsCategoryContent | null | undefined,
  siteName: string,
  defaults: { title: string; description: string }
): { title: string; description: string } {
  const categoryTitle = categoryContent?.title?.trim() || defaults.title;

  return {
    title: formatSeoTitle(getCategorySeoTitle(categoryContent, categoryTitle), siteName),
    description: categoryContent?.seo?.description?.trim() || defaults.description,
  };
}

export function getCategoryHeading(
  category: HttpTypes.StoreProductCategory,
  categoryContent?: CmsCategoryContent | null
): string {
  return (
    categoryContent?.h1?.trim() ||
    category.name?.trim() ||
    categoryContent?.title?.trim() ||
    category.handle ||
    "Category"
  );
}

/** H1 override for BreadcrumbList JSON-LD; falls back to the visible breadcrumb label. */
export function getCategoryStructuredBreadcrumbLabel(
  visibleLabel: string,
  categoryContent?: CmsCategoryContent | null
): string {
  return categoryContent?.h1?.trim() || visibleLabel.trim();
}

export function getCategorySeo(
  category: HttpTypes.StoreProductCategory,
  siteName: string,
  categoryContent?: CmsCategoryContent | null
): { title: string; description: string } {
  const metadata = (category.metadata ?? {}) as Record<string, string>;
  const categoryTitle =
    category.name?.trim() ||
    categoryContent?.title?.trim() ||
    category.handle ||
    "Category";

  return {
    title: formatSeoTitle(getCategorySeoTitle(categoryContent, categoryTitle), siteName),
    description:
      categoryContent?.seo?.description?.trim() ||
      metadata.seo_description?.trim() ||
      category.description?.trim() ||
      `Browse products in ${category.name}.`,
  };
}
