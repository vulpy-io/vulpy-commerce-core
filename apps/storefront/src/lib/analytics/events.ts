import { emit, hasActiveAnalytics } from "./bus";
import { oncePerSession } from "./dedupe";
import { isGtmConfigured } from "./gtm";
import { isMatomoConfigured } from "./matomo";
import { stripPiiFromString } from "./sanitize";
import type { AnalyticsProductRef } from "./types";

function anyProviderConfigured(): boolean {
  return isMatomoConfigured() || isGtmConfigured();
}

export function trackProductImpression(product: AnalyticsProductRef): void {
  if (!anyProviderConfigured()) {
    return;
  }
  const listId = product.listId ?? product.listName ?? "product_grid";
  const listName = product.listName ?? listId;
  const key = `impression:${listId}:${product.productId}`;
  if (!oncePerSession(key)) {
    return;
  }
  emit({
    name: "view_item_list",
    items: [
      {
        item_id: product.variantId || product.productId,
        item_name: stripPiiFromString(product.name),
        price: product.price,
        item_brand: product.brand ? stripPiiFromString(product.brand) : undefined,
        item_category: product.category ? stripPiiFromString(product.category) : undefined,
        item_list_id: listId,
        item_list_name: listName,
        index: product.position,
      },
    ],
    item_list_id: listId,
    item_list_name: listName,
  });
}

export function trackSelectItem(product: AnalyticsProductRef): void {
  if (!anyProviderConfigured()) {
    return;
  }
  const listId = product.listId ?? product.listName ?? "product_grid";
  const listName = product.listName ?? listId;
  emit({
    name: "select_item",
    item: {
      item_id: product.variantId || product.productId,
      item_name: stripPiiFromString(product.name),
      price: product.price,
      item_brand: product.brand ? stripPiiFromString(product.brand) : undefined,
      item_category: product.category ? stripPiiFromString(product.category) : undefined,
      item_list_id: listId,
      item_list_name: listName,
      index: product.position,
    },
    item_list_id: listId,
    item_list_name: listName,
  });
}

export function trackCustomEvent(
  category: string,
  action: string,
  name?: string,
  value?: number
): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({
    name: "custom",
    category,
    action,
    label: name ? stripPiiFromString(name) : undefined,
    value,
  });
}

export function trackPageViewEvent(url: string, title?: string): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({ name: "page_view", url, title });
}

export function trackViewItem(input: {
  sku: string;
  name: string;
  category?: string;
  brand?: string;
  price?: number;
  currency?: string;
}): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({
    name: "view_item",
    item: {
      item_id: input.sku,
      item_name: stripPiiFromString(input.name),
      price: input.price,
      item_brand: input.brand ? stripPiiFromString(input.brand) : undefined,
      item_category: input.category ? stripPiiFromString(input.category) : undefined,
      quantity: 1,
    },
    value: input.price,
    currency: input.currency,
  });
}

export function trackSiteSearchEvent(input: {
  keyword: string;
  category: string | false;
  resultCount: number;
  url?: string;
  title?: string;
}): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({
    name: "site_search",
    keyword: stripPiiFromString(input.keyword),
    category: input.category,
    resultCount: input.resultCount,
    url: input.url,
    title: input.title,
  });
}

export function trackFilterApplied(filterType: string, filterValue: string): void {
  if (!(anyProviderConfigured() && hasActiveAnalytics())) {
    return;
  }
  emit({
    name: "filter_applied",
    filter_type: stripPiiFromString(filterType),
    filter_value: stripPiiFromString(filterValue),
  });
}

export function trackSortChanged(sort: string): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({ name: "sort_changed", sort: stripPiiFromString(sort) });
}

export function trackPageChanged(page: number, listName?: string): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({
    name: "page_changed",
    page,
    list_name: listName ? stripPiiFromString(listName) : undefined,
  });
}

export function trackSetUserId(userId: string | null): void {
  if (!anyProviderConfigured()) {
    return;
  }
  emit({ name: "set_user_id", userId });
}

/** Build stable GA4 list id/name for catalog surfaces. */
export function catalogListIdentity(input: {
  categoryHandle?: string;
  catalogScope?: "shop" | "sale" | "selection";
  selectionHandle?: string;
  pageTitle?: string;
}): { listId: string; listName: string } {
  if (input.categoryHandle) {
    return {
      listId: `category:${input.categoryHandle}`,
      listName: input.pageTitle || input.categoryHandle,
    };
  }
  if (input.catalogScope === "sale") {
    return { listId: "sale", listName: input.pageTitle || "Sale" };
  }
  if (input.catalogScope === "selection" && input.selectionHandle) {
    return {
      listId: `selection:${input.selectionHandle}`,
      listName: input.pageTitle || input.selectionHandle,
    };
  }
  return { listId: "shop", listName: input.pageTitle || "Shop" };
}
