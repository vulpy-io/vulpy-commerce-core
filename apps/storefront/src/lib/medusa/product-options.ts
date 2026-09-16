import type { HttpTypes } from "@medusajs/types";
import type { ProductOption } from "@/types/product-detail";

export type LineItemOption = {
  option?: { title?: string | null } | null;
  value?: string | null;
};

export function getCustomerFacingOptions(
  options: ProductOption[]
): ProductOption[] {
  return options.filter((option) => option.values.length > 1);
}

export function buildProductOptionsFromStoreProduct(
  product: HttpTypes.StoreProduct | null | undefined
): ProductOption[] {
  if (!product?.options?.length) {
    return [];
  }

  return product.options
    .filter((option) => option.title)
    .map((option) => ({
      id: option.id ?? option.title ?? "",
      title: option.title ?? "",
      values: (option.values ?? [])
        .map((value) => value.value)
        .filter((value): value is string => Boolean(value)),
    }));
}

export function formatLineItemOptions(
  variantOptions: LineItemOption[] | null | undefined,
  productOptions?: ProductOption[]
): string {
  if (!variantOptions?.length) {
    return "";
  }

  const visibleTitles = productOptions
    ? new Set(getCustomerFacingOptions(productOptions).map((o) => o.title))
    : null;

  const values = variantOptions
    .filter((opt) => {
      const title = opt.option?.title;
      if (!(title && opt.value)) {
        return false;
      }
      if (!visibleTitles) {
        return variantOptions.length > 1;
      }
      return visibleTitles.has(title);
    })
    .map((opt) => opt.value as string);

  return values.join(", ");
}

export function formatVariantOptionLabel(
  optionValues: Record<string, string> | undefined,
  productOptions?: ProductOption[]
): string {
  if (!optionValues || Object.keys(optionValues).length === 0) {
    return "";
  }

  const lineItemOptions: LineItemOption[] = Object.entries(optionValues).map(
    ([title, value]) => ({
      option: { title },
      value,
    })
  );

  return formatLineItemOptions(lineItemOptions, productOptions);
}

export function formatCartLineItemOptions(
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
): string {
  const productOptions = buildProductOptionsFromStoreProduct(item.product);
  return formatLineItemOptions(item.variant?.options, productOptions);
}
