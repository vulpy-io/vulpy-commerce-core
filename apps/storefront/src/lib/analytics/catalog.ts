import type { EcommerceItem, EcommerceOrder } from "./types";

/** GA4-shaped item used by ecommerce catalog events (adapters map as needed). */
export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_brand?: string;
  item_category?: string;
  item_list_id?: string;
  item_list_name?: string;
  index?: number;
};

export type AnalyticsEvent =
  | { name: "page_view"; url: string; title?: string }
  | {
      name: "view_item";
      item: AnalyticsItem;
      value?: number;
      currency?: string;
    }
  | {
      name: "view_item_list";
      items: AnalyticsItem[];
      item_list_id?: string;
      item_list_name?: string;
    }
  | {
      name: "select_item";
      item: AnalyticsItem;
      item_list_id?: string;
      item_list_name?: string;
    }
  | {
      name: "add_to_cart";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      source?: string;
    }
  | {
      name: "remove_from_cart";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      source?: string;
    }
  | {
      name: "update_cart_quantity";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      source?: string;
    }
  | {
      name: "view_cart";
      items: AnalyticsItem[];
      value: number;
      currency: string;
    }
  | {
      name: "clear_cart";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      source?: string;
    }
  | {
      name: "begin_checkout";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      coupon?: string;
    }
  | {
      name: "add_shipping_info";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      shipping_tier?: string;
      coupon?: string;
    }
  | {
      name: "add_payment_info";
      items: AnalyticsItem[];
      value: number;
      currency: string;
      payment_type?: string;
      coupon?: string;
    }
  | {
      name: "purchase";
      /** Pseudonymized id for privacy-first adapters (Matomo). */
      order: EcommerceOrder;
      /** Merchant-facing transaction id for GA4/Ads (display_id or id). */
      transactionId: string;
      coupon?: string;
    }
  | {
      name: "site_search";
      keyword: string;
      category: string | false;
      resultCount: number;
      url?: string;
      title?: string;
    }
  | {
      name: "custom";
      category: string;
      action: string;
      label?: string;
      value?: number;
    }
  | { name: "set_user_id"; userId: string | null }
  | {
      name: "filter_applied";
      filter_type: string;
      filter_value: string;
    }
  | { name: "sort_changed"; sort: string }
  | { name: "page_changed"; page: number; list_name?: string };

export type AnalyticsProvider = {
  id: string;
  isConfigured: () => boolean;
  onConsentChange?: (granted: boolean) => void;
  track: (event: AnalyticsEvent) => void;
};

export function ecommerceItemToAnalyticsItem(item: EcommerceItem): AnalyticsItem {
  return {
    item_id: item.sku,
    item_name: item.name,
    price: item.price,
    quantity: item.quantity,
    item_category: item.category,
    item_brand: item.brand,
  };
}
