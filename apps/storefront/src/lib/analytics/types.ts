export const CONSENT_COOKIE_NAME = "_vulpy_consent";
export const CONSENT_VERSION = 1;

export type ConsentPurpose =
  | "necessary"
  | "analytics"
  | "preferences"
  | "externalMedia";

export type ConsentChoices = {
  necessary: true;
  analytics: boolean;
  preferences: boolean;
  externalMedia: boolean;
};

export type StoredConsent = {
  version: number;
  updatedAt: string;
  choices: ConsentChoices;
};

export type CartMutationKind =
  | "add"
  | "update"
  | "remove"
  | "clear"
  | "hydrate"
  | "checkout";

export type EcommerceItem = {
  sku: string;
  name: string;
  category?: string;
  brand?: string;
  price: number;
  quantity: number;
};

export type EcommerceOrder = {
  orderId: string;
  revenue: number;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  currency: string;
  items: EcommerceItem[];
};

export type AnalyticsProductRef = {
  productId: string;
  variantId?: string;
  name: string;
  category?: string;
  brand?: string;
  price?: number;
  /** Stable list id for GA4 item_list_id (e.g. shop, category:shirts, related). */
  listId?: string;
  listName?: string;
  position?: number;
};

declare global {
  interface Window {
    _paq?: Array<unknown[] | { push: (...args: unknown[]) => void }>;
    dataLayer?: unknown[];
    globalPrivacyControl?: boolean;
  }
}
