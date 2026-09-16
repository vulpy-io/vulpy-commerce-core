import type { BreadcrumbItem } from "@/components/Common/Breadcrumb";
import { getCategoryContentByHandles } from "@/lib/cms/queries";
import { applyStructuredCategoryBreadcrumbLabels } from "./structured-breadcrumb";

export async function enrichBreadcrumbStructuredLabels(
  items: BreadcrumbItem[]
): Promise<BreadcrumbItem[]> {
  const handles = Array.from(
    new Set(
      items
        .map((item) => item.categoryHandle)
        .filter((handle): handle is string => Boolean(handle))
    )
  );

  if (handles.length === 0) {
    return items;
  }

  const contentByHandle = await getCategoryContentByHandles(handles);
  return applyStructuredCategoryBreadcrumbLabels(items, contentByHandle);
}
