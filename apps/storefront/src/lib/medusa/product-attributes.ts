import type { ProductAttribute } from "@/types/product-detail";

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

const PDP_EXCLUDED_SPEC_LABELS = new Set(["ean code", "ean", "contains"]);

export function getAttributeByLabels(
  attributes: ProductAttribute[] | undefined,
  labels: string[]
): string | null {
  if (!attributes?.length) {
    return null;
  }

  const normalized = new Set(labels.map(normalizeLabel));
  const match = attributes.find((attribute) =>
    normalized.has(normalizeLabel(attribute.label))
  );

  return match?.value?.trim() || null;
}

export function getPdpSpecificationAttributes(
  attributes: ProductAttribute[]
): ProductAttribute[] {
  return attributes.filter(
    (attribute) => !PDP_EXCLUDED_SPEC_LABELS.has(normalizeLabel(attribute.label))
  );
}

export function resolveProductEan(
  attributes: ProductAttribute[] | undefined,
  variantEan?: string | null
): string | null {
  const fromVariant = variantEan?.trim();
  if (fromVariant) {
    return fromVariant;
  }

  return getAttributeByLabels(attributes, ["EAN code", "EAN"]);
}

export function resolveProductContains(
  attributes: ProductAttribute[] | undefined
): string | null {
  return getAttributeByLabels(attributes, ["Contains"]);
}
