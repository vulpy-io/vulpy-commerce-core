import type { AnalyticsEvent, AnalyticsItem, AnalyticsProvider } from "../catalog";
import {
  addEcommerceItem,
  clearEcommerceCart,
  disableMatomoTracking,
  enableMatomoCookies,
  getMatomoConfig,
  initMatomoQueue,
  isMatomoConfigured,
  loadMatomoScript,
  optUserBackIn,
  pushMatomoCommand,
  setEcommerceView,
  trackEcommerceCartUpdate,
  trackEcommerceOrder,
  trackEvent,
  trackPageView,
  trackSiteSearch,
} from "../matomo";

function toMatomoItem(item: AnalyticsItem) {
  return {
    sku: item.item_id,
    name: item.item_name,
    category: item.item_category,
    price: item.price ?? 0,
    quantity: item.quantity ?? 1,
  };
}

function pushCartSnapshot(items: AnalyticsItem[], value: number): void {
  clearEcommerceCart();
  for (const item of items) {
    addEcommerceItem(toMatomoItem(item));
  }
  trackEcommerceCartUpdate(value);
}

function trackMatomoEvent(event: AnalyticsEvent): void {
  switch (event.name) {
    case "page_view":
      trackPageView(event.url, event.title);
      return;
    case "view_item":
      setEcommerceView({
        sku: event.item.item_id,
        name: event.item.item_name,
        category: event.item.item_category,
        price: event.item.price,
      });
      return;
    case "view_item_list":
      for (const item of event.items) {
        trackEvent(
          "Catalog",
          "item_impression",
          [event.item_list_name, item.item_id, item.item_name].filter(Boolean).join("|"),
          item.price
        );
      }
      return;
    case "select_item":
      trackEvent(
        "Catalog",
        "select_item",
        [event.item_list_name, event.item.item_id, event.item.item_name]
          .filter(Boolean)
          .join("|"),
        event.item.price
      );
      return;
    case "add_to_cart":
      pushCartSnapshot(event.items, event.value);
      trackEvent("Cart", "add_to_cart", event.source, event.value);
      return;
    case "remove_from_cart":
      pushCartSnapshot(event.items, event.value);
      trackEvent("Cart", "remove_from_cart", event.source, event.value);
      return;
    case "update_cart_quantity":
      pushCartSnapshot(event.items, event.value);
      trackEvent("Cart", "update_cart_quantity", event.source, event.value);
      return;
    case "clear_cart":
      pushCartSnapshot(event.items, event.value);
      trackEvent("Cart", "clear_cart", event.source, event.value);
      return;
    case "view_cart":
      trackEvent("Cart", "view_cart", undefined, event.items.length);
      return;
    case "begin_checkout":
      trackEvent("Checkout", "begin_checkout", undefined, event.items.length);
      return;
    case "add_shipping_info":
      trackEvent("Checkout", "shipping_method_selected", event.shipping_tier);
      return;
    case "add_payment_info":
      trackEvent("Checkout", "payment_method_selected", event.payment_type);
      return;
    case "purchase":
      trackEcommerceOrder(event.order);
      return;
    case "site_search":
      trackSiteSearch(event.keyword, event.category, event.resultCount);
      if (event.url) {
        trackPageView(event.url, event.title);
      }
      return;
    case "custom":
      trackEvent(event.category, event.action, event.label, event.value);
      return;
    case "set_user_id":
      if (event.userId) {
        pushMatomoCommand("setUserId", event.userId);
      } else {
        pushMatomoCommand("resetUserId");
      }
      return;
    case "filter_applied":
      trackEvent("Catalog", "filter_applied", `${event.filter_type}:${event.filter_value}`);
      return;
    case "sort_changed":
      trackEvent("Catalog", "sort_changed", event.sort);
      return;
    case "page_changed":
      trackEvent("Catalog", "page_changed", event.list_name, event.page);
      return;
    default:
      return;
  }
}

export function createMatomoProvider(): AnalyticsProvider {
  let scriptStarted = false;

  return {
    id: "matomo",
    isConfigured: isMatomoConfigured,
    onConsentChange(granted) {
      const config = getMatomoConfig();
      if (!config) {
        return;
      }
      if (!granted) {
        disableMatomoTracking();
        return;
      }
      initMatomoQueue(config.siteId, config.url);
      optUserBackIn();
      enableMatomoCookies();
      if (!scriptStarted) {
        scriptStarted = true;
        loadMatomoScript(config.url).catch(() => {
          scriptStarted = false;
        });
      }
    },
    track: trackMatomoEvent,
  };
}
