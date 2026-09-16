import type { AnalyticsEvent, AnalyticsItem, AnalyticsProvider } from "../catalog";
import {
  clearEcommerceDataLayer,
  ensureGtmConsentDefaults,
  getGtmConfig,
  isGtmConfigured,
  loadGtmScript,
  pushDataLayer,
  updateGtmConsent,
} from "../gtm";

function ga4Items(items: AnalyticsItem[]) {
  return items.map((item) => ({
    item_id: item.item_id,
    item_name: item.item_name,
    price: item.price,
    quantity: item.quantity ?? 1,
    item_brand: item.item_brand,
    item_category: item.item_category,
    item_list_id: item.item_list_id,
    item_list_name: item.item_list_name,
    index: item.index,
  }));
}

function pushEcommerce(
  eventName: string,
  ecommerce: Record<string, unknown>,
  extra?: Record<string, unknown>
): void {
  clearEcommerceDataLayer();
  pushDataLayer({
    event: eventName,
    ecommerce,
    ...extra,
  });
}

function trackGtmEvent(event: AnalyticsEvent): void {
  switch (event.name) {
    case "page_view":
      pushDataLayer({
        event: "page_view",
        page_location: event.url,
        page_title: event.title,
      });
      return;
    case "view_item":
      pushEcommerce("view_item", {
        currency: event.currency,
        value: event.value ?? event.item.price,
        items: ga4Items([event.item]),
      });
      return;
    case "view_item_list":
      pushEcommerce("view_item_list", {
        item_list_id: event.item_list_id,
        item_list_name: event.item_list_name,
        items: ga4Items(
          event.items.map((item) => ({
            ...item,
            item_list_id: item.item_list_id ?? event.item_list_id,
            item_list_name: item.item_list_name ?? event.item_list_name,
          }))
        ),
      });
      return;
    case "select_item":
      pushEcommerce("select_item", {
        item_list_id: event.item_list_id,
        item_list_name: event.item_list_name,
        items: ga4Items([
          {
            ...event.item,
            item_list_id: event.item.item_list_id ?? event.item_list_id,
            item_list_name: event.item.item_list_name ?? event.item_list_name,
          },
        ]),
      });
      return;
    case "add_to_cart":
      pushEcommerce("add_to_cart", {
        currency: event.currency,
        value: event.value,
        items: ga4Items(event.items),
      });
      return;
    case "remove_from_cart":
      pushEcommerce("remove_from_cart", {
        currency: event.currency,
        value: event.value,
        items: ga4Items(event.items),
      });
      return;
    case "view_cart":
      pushEcommerce("view_cart", {
        currency: event.currency,
        value: event.value,
        items: ga4Items(event.items),
      });
      return;
    case "update_cart_quantity":
      pushEcommerce("add_to_cart", {
        currency: event.currency,
        value: event.value,
        items: ga4Items(event.items),
      });
      return;
    case "clear_cart":
      pushEcommerce("remove_from_cart", {
        currency: event.currency,
        value: event.value,
        items: ga4Items(event.items),
      });
      return;
    case "begin_checkout":
      pushEcommerce("begin_checkout", {
        currency: event.currency,
        value: event.value,
        coupon: event.coupon,
        items: ga4Items(event.items),
      });
      return;
    case "add_shipping_info":
      pushEcommerce("add_shipping_info", {
        currency: event.currency,
        value: event.value,
        coupon: event.coupon,
        shipping_tier: event.shipping_tier,
        items: ga4Items(event.items),
      });
      return;
    case "add_payment_info":
      pushEcommerce("add_payment_info", {
        currency: event.currency,
        value: event.value,
        coupon: event.coupon,
        payment_type: event.payment_type,
        items: ga4Items(event.items),
      });
      return;
    case "purchase":
      pushEcommerce("purchase", {
        transaction_id: event.transactionId,
        value: event.order.revenue,
        tax: event.order.tax,
        shipping: event.order.shipping,
        currency: event.order.currency,
        coupon: event.coupon,
        items: ga4Items(
          event.order.items.map((item) => ({
            item_id: item.sku,
            item_name: item.name,
            price: item.price,
            quantity: item.quantity,
            item_category: item.category,
            item_brand: item.brand,
          }))
        ),
      });
      return;
    case "site_search":
      pushDataLayer({
        event: "search",
        search_term: event.keyword,
        search_results: event.resultCount,
      });
      if (event.url) {
        pushDataLayer({
          event: "page_view",
          page_location: event.url,
          page_title: event.title,
        });
      }
      return;
    case "custom":
      pushDataLayer({
        event: event.action,
        event_category: event.category,
        event_label: event.label,
        value: event.value,
      });
      return;
    case "set_user_id":
      pushDataLayer({
        event: "user_id_set",
        user_id: event.userId ?? undefined,
      });
      pushDataLayer({ user_id: event.userId });
      return;
    case "filter_applied":
      pushDataLayer({
        event: "filter_applied",
        filter_type: event.filter_type,
        filter_value: event.filter_value,
      });
      return;
    case "sort_changed":
      pushDataLayer({
        event: "sort_changed",
        sort: event.sort,
      });
      return;
    case "page_changed":
      pushDataLayer({
        event: "page_changed",
        page: event.page,
        list_name: event.list_name,
      });
      return;
    default:
      return;
  }
}

export function createGtmProvider(): AnalyticsProvider {
  let loaded = false;

  return {
    id: "gtm",
    isConfigured: isGtmConfigured,
    onConsentChange(granted) {
      ensureGtmConsentDefaults();
      updateGtmConsent(granted);
      const config = getGtmConfig();
      if (!(granted && config) || loaded) {
        return;
      }
      loadGtmScript(config.containerId);
      loaded = true;
    },
    track: trackGtmEvent,
  };
}
