import type { HttpTypes } from "@medusajs/types";
import type { CmsProductContent } from "@/lib/cms/types";
import { formatSeoTitle } from "@/lib/seo/format-seo-title";

const MODEL_ATTRIBUTE_LABEL = "Model";

export function getProductModel(
  metadata?: Record<string, unknown> | null
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const raw = metadata.attributes;
  if (!Array.isArray(raw)) {
    return undefined;
  }

  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      (item as { label?: unknown }).label === MODEL_ATTRIBUTE_LABEL &&
      typeof (item as { value?: unknown }).value === "string"
    ) {
      const value = (item as { value: string }).value.trim();
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

export function getProductSeo(
  product: HttpTypes.StoreProduct | null | undefined,
  productContent: CmsProductContent | null | undefined,
  siteName: string
): { title: string; description: string } {
  const metadata = (product?.metadata ?? {}) as Record<string, string>;
  const model = getProductModel(product?.metadata as Record<string, unknown>);

  const defaultTitle =
    model || product?.title?.trim() || productContent?.title?.trim() || "Product";

  const baseTitle =
    productContent?.seo?.title?.trim() ||
    metadata.seo_title?.trim() ||
    defaultTitle;

  return {
    title: formatSeoTitle(baseTitle, siteName),
    description:
      productContent?.seo?.description?.trim() ||
      metadata.seo_description?.trim() ||
      product?.subtitle?.trim() ||
      product?.description?.trim() ||
      "",
  };
}
