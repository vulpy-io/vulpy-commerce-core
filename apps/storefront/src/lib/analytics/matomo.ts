import { getAnalyticsConsentGranted } from "./bus";
import type { EcommerceItem, EcommerceOrder } from "./types";

const TRAILING_SLASH = /\/$/;

export function getMatomoConfig(): { url: string; siteId: string } | null {
  const url = (process.env.NEXT_PUBLIC_MATOMO_URL ?? "").replace(TRAILING_SLASH, "");
  const siteId = (process.env.NEXT_PUBLIC_MATOMO_SITE_ID ?? "").trim();
  if (!(url && siteId)) {
    return null;
  }
  return { url, siteId };
}

export function isMatomoConfigured(): boolean {
  return getMatomoConfig() !== null;
}

function getQueue(): unknown[][] {
  if (typeof window === "undefined") {
    return [];
  }
  window._paq = window._paq || [];
  return window._paq as unknown[][];
}

export function pushMatomoCommand(...args: unknown[]): void {
  if (!isMatomoConfigured()) {
    return;
  }
  // Setup / consent commands may run to initialize or revoke; tracking commands need consent.
  const command = typeof args[0] === "string" ? args[0] : "";
  const alwaysAllowed = new Set([
    "setTrackerUrl",
    "setSiteId",
    "requireCookieConsent",
    "enableLinkTracking",
    "setCookieConsentGiven",
    "forgetCookieConsentGiven",
    "optUserOut",
    "forgetUserOptOut",
    "setUserId",
    "resetUserId",
  ]);
  if (!(getAnalyticsConsentGranted() || alwaysAllowed.has(command))) {
    return;
  }
  getQueue().push(args);
}

export function initMatomoQueue(siteId: string, trackerUrl: string): void {
  pushMatomoCommand("setTrackerUrl", `${trackerUrl}/matomo.php`);
  pushMatomoCommand("setSiteId", siteId);
  pushMatomoCommand("requireCookieConsent");
  pushMatomoCommand("enableLinkTracking");
}

export function enableMatomoCookies(): void {
  pushMatomoCommand("setCookieConsentGiven");
}

export function disableMatomoTracking(): void {
  pushMatomoCommand("forgetCookieConsentGiven");
  pushMatomoCommand("optUserOut");
  deleteMatomoCookies();
}

export function optUserBackIn(): void {
  pushMatomoCommand("forgetUserOptOut");
}

export function deleteMatomoCookies(): void {
  if (typeof document === "undefined") {
    return;
  }

  const cookies = document.cookie.split(";");
  for (const entry of cookies) {
    const name = entry.split("=")[0]?.trim() ?? "";
    if (!(name.startsWith("_pk_") || name.startsWith("mtm_") || name.startsWith("matomo_"))) {
      continue;
    }
    // biome-ignore lint/suspicious/noDocumentCookie: must clear Matomo cookies on consent withdrawal
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    // biome-ignore lint/suspicious/noDocumentCookie: must clear Matomo cookies on consent withdrawal
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadMatomoScript(baseUrl: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-matomo="1"]');
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.matomo = "1";
    script.src = `${baseUrl}/matomo.js`;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Matomo script"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function trackPageView(url: string, title?: string): void {
  pushMatomoCommand("setCustomUrl", url);
  if (title) {
    pushMatomoCommand("setDocumentTitle", title);
  }
  pushMatomoCommand("trackPageView");
}

export function trackSiteSearch(keyword: string, category: string | false, resultCount: number): void {
  pushMatomoCommand("trackSiteSearch", keyword, category, resultCount);
}

export function setEcommerceView(product: {
  sku: string;
  name: string;
  category?: string;
  price?: number;
}): void {
  pushMatomoCommand(
    "setEcommerceView",
    product.sku,
    product.name,
    product.category ?? false,
    product.price ?? false
  );
}

export function clearEcommerceCart(): void {
  pushMatomoCommand("clearEcommerceCart");
}

export function addEcommerceItem(item: EcommerceItem): void {
  pushMatomoCommand(
    "addEcommerceItem",
    item.sku,
    item.name,
    item.category ?? false,
    item.price,
    item.quantity
  );
}

export function trackEcommerceCartUpdate(grandTotal: number): void {
  pushMatomoCommand("trackEcommerceCartUpdate", grandTotal);
}

export function trackEcommerceOrder(order: EcommerceOrder): void {
  for (const item of order.items) {
    addEcommerceItem(item);
  }
  pushMatomoCommand(
    "trackEcommerceOrder",
    order.orderId,
    order.revenue,
    order.subtotal,
    order.tax,
    order.shipping,
    order.discount
  );
}

export function trackEvent(
  category: string,
  action: string,
  name?: string,
  value?: number
): void {
  if (value === undefined) {
    pushMatomoCommand("trackEvent", category, action, name);
    return;
  }
  pushMatomoCommand("trackEvent", category, action, name, value);
}
