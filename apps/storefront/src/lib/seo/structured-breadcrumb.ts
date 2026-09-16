import type { BreadcrumbItem } from "@/components/Common/Breadcrumb";
import type { CmsCategoryContent } from "@/lib/cms/types";
import { getCategoryStructuredBreadcrumbLabel } from "@/lib/medusa/category-seo";

export function applyStructuredCategoryBreadcrumbLabels(
  items: BreadcrumbItem[],
  contentByHandle: Map<string, CmsCategoryContent | null | undefined>
): BreadcrumbItem[] {
  return items.map((item) => {
    if (!item.categoryHandle) {
      return item;
    }

    const structuredLabel = getCategoryStructuredBreadcrumbLabel(
      item.label,
      contentByHandle.get(item.categoryHandle) ?? null
    );

    if (structuredLabel === item.label) {
      return item;
    }

    return { ...item, structuredLabel };
  });
}
