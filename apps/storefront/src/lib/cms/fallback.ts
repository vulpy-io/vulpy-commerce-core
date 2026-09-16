import { defaultPaymentMethods, defaultSiteSettings } from "./defaults";
import type { CmsFooter, CmsNavItem, CmsSiteSettings } from "./types";

/**
 * Seed/demo CMS copy is for local empty-DB bootstraps only.
 * Production must never render these after a Payload read failure.
 * Markers match distinctive strings in `defaults.ts` (seed/demo copy).
 * Historical upstream markers stay listed so legacy DBs are still caught.
 */
export const CMS_SEED_MARKERS = [
  "James Septimus",
  "Medusa Store | Medusa Commerce",
  "Vulpy Commerce | Medusa Commerce",
  "(+965) 7492-3477",
  "(+099) 532-786-9843",
  "685 Market Street, Las Vegas",
  "Don't Miss Out Latest Trends & Offers",
  "Next.js storefront powered by Medusa",
] as const;

/** When true, allow `defaults.ts` seed content (local / empty CMS). */
export function cmsDefaultsAllowed(): boolean {
  if (process.env.CMS_ALLOW_DEFAULTS === "1") {
    return true;
  }
  if (process.env.CMS_ALLOW_DEFAULTS === "0") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

/** Fail the request instead of serving an empty shell (opt-in). */
export function cmsStrictMode(): boolean {
  return process.env.CMS_STRICT === "1";
}

/** Minimal chrome — no seed brand, phones, or demo nav. */
export const emptySiteSettings: CmsSiteSettings = {
  siteName: "",
  logoUrl: "/images/logo/logo.svg",
  checkoutLogoUrl: "",
  supportPhone: "",
  searchPlaceholder: "",
  hideCart: false,
  medusaCategoriesInNavigation: "before",
  contactInfo: {
    address: "",
    phone: "",
    email: "",
    contactName: "",
  },
  socialLinks: [],
  copyright: "",
  defaultSeo: { title: "", description: "" },
  utilityPageSeo: [],
  shopLabels: {
    breadcrumb: defaultSiteSettings.shopLabels.breadcrumb,
    sortOptions: { ...defaultSiteSettings.shopLabels.sortOptions },
  },
  authLabels: { ...defaultSiteSettings.authLabels },
  merchantListing: {},
  showroom: { enabled: false },
  paymentMethods: defaultPaymentMethods,
};

export const emptyNavigation: CmsNavItem[] = [];

export const emptyFooter: CmsFooter = {
  preFooterBlocks: [],
  helpTitle: "",
  columns: [],
  legalLinks: [],
};

export function htmlContainsCmsSeedMarker(html: string): string | null {
  for (const marker of CMS_SEED_MARKERS) {
    if (html.includes(marker)) {
      return marker;
    }
  }
  return null;
}
