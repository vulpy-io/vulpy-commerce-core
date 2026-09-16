import config from "@payload-config";
import { draftMode } from "next/headers";
import { getPayload } from "payload";
import { cache } from "react";
import {
  DEFAULT_SORT_LABELS,
  SHOP_SORT_VALUES,
  type ShopSortValue,
} from "@/lib/medusa/shop-display";
import { mapBlocks } from "./block-mappers";
import {
  defaultFooter,
  defaultNavigation,
  defaultPages,
  defaultPaymentMethods,
  defaultSiteSettings,
} from "./defaults";
import {
  cmsDefaultsAllowed,
  cmsStrictMode,
  emptyFooter,
  emptyNavigation,
  emptySiteSettings,
} from "./fallback";
import { getMediaAlt, getMediaUrl } from "./media";
import { getPseudoCategoryByHandle } from "./pseudo-categories";
import type {
  CmsBlock,
  CmsBlogPost,
  CmsCategoryContent,
  CmsFooter,
  CmsNavItem,
  CmsPage,
  CmsPaymentMethod,
  CmsProductContent,
  CmsSiteSettings,
} from "./types";

async function getPayloadClient() {
  const dbUrl = process.env.DATABASE_URI || process.env.PAYLOAD_DATABASE_URL;
  if (!dbUrl) { return null; }
  try {
    return await getPayload({ config });
  } catch (error) {
    console.error("[cms] getPayload init failed", error);
    if (cmsStrictMode()) {
      throw error;
    }
    return null;
  }
}

function onCmsReadFailure(scope: string, error: unknown): never | null {
  console.error(`[cms] ${scope} failed`, error);
  if (cmsStrictMode()) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  return null;
}

function mapPaymentMethods(
  doc: Record<string, unknown> | null | undefined
): CmsPaymentMethod[] {
  const items =
    (doc?.paymentMethods as { icon?: unknown }[] | undefined) || [];

  const mapped = items
    .map((item) => ({
      iconUrl: getMediaUrl(item.icon as never, ""),
      alt: getMediaAlt(item.icon as never, "Payment method"),
    }))
    .filter((item): item is CmsPaymentMethod => Boolean(item.iconUrl));

  const allowDefaults = cmsDefaultsAllowed();
  return mapped.length > 0 ? mapped : allowDefaults ? defaultPaymentMethods : [];
}

function mapSortOptionLabels(
  sortOptions: unknown
): Partial<Record<ShopSortValue, string>> {
  const entries = (sortOptions as { value?: string; label?: string }[]) ?? [];
  if (!entries.length) {
    return defaultSiteSettings.shopLabels.sortOptions;
  }

  const hasStableValues = entries.every(
    (entry) =>
      typeof entry?.value === "string" &&
      SHOP_SORT_VALUES.includes(entry.value as ShopSortValue)
  );

  if (!hasStableValues) {
    return defaultSiteSettings.shopLabels.sortOptions;
  }

  const labels: Partial<Record<ShopSortValue, string>> = {};

  for (const entry of entries) {
    const value = entry.value as ShopSortValue;
    const label = entry.label?.trim();
    if (label) {
      labels[value] = label;
    }
  }

  for (const value of SHOP_SORT_VALUES) {
    labels[value] ??= DEFAULT_SORT_LABELS[value];
  }

  return labels;
}

function mapSiteSettings(doc: Record<string, unknown> | null | undefined): CmsSiteSettings {
  if (!doc) {
    return cmsDefaultsAllowed() ? defaultSiteSettings : emptySiteSettings;
  }
  const allowDefaults = cmsDefaultsAllowed();
  const contactInfo = (doc.contactInfo as Record<string, string>) || {};
  const defaultSeo = (doc.defaultSeo as Record<string, string>) || {};
  const shopLabels = (doc.shopLabels as Record<string, unknown>) || {};
  const authLabels = (doc.authLabels as Record<string, string>) || {};
  return {
    siteName: (doc.siteName as string) || (allowDefaults ? defaultSiteSettings.siteName : ""),
    logoUrl: getMediaUrl(doc.logo as never, allowDefaults ? defaultSiteSettings.logoUrl : ""),
    checkoutLogoUrl: getMediaUrl(
      doc.checkoutLogo as never,
      allowDefaults ? (defaultSiteSettings.checkoutLogoUrl ?? "") : ""
    ),
    supportPhone: (doc.supportPhone as string) || (allowDefaults ? defaultSiteSettings.supportPhone : ""),
    searchPlaceholder:
      (doc.searchPlaceholder as string) || (allowDefaults ? defaultSiteSettings.searchPlaceholder : ""),
    topBarText: (doc.topBarText as string) || (allowDefaults ? defaultSiteSettings.topBarText : ""),
    topBarLinks: Array.isArray(doc.topBarLinks) && doc.topBarLinks.length > 0
      ? (doc.topBarLinks as { label: string; url: string }[])
      : (allowDefaults ? defaultSiteSettings.topBarLinks ?? [] : []),
    hideCart:
      typeof doc.hideCart === "boolean"
        ? (doc.hideCart as boolean)
        : allowDefaults
          ? defaultSiteSettings.hideCart
          : false,
    medusaCategoriesInNavigation:
      doc.medusaCategoriesInNavigation === "after" ||
      doc.medusaCategoriesInNavigation === "hide"
        ? doc.medusaCategoriesInNavigation
        : allowDefaults
          ? defaultSiteSettings.medusaCategoriesInNavigation
          : "before",
    contactInfo: {
      address: contactInfo.address || (allowDefaults ? defaultSiteSettings.contactInfo.address : ""),
      phone: contactInfo.phone || (allowDefaults ? defaultSiteSettings.contactInfo.phone : ""),
      email: contactInfo.email || (allowDefaults ? defaultSiteSettings.contactInfo.email : ""),
      contactName: contactInfo.contactName || (allowDefaults ? defaultSiteSettings.contactInfo.contactName : ""),
    },
    socialLinks:
      (doc.socialLinks as CmsSiteSettings["socialLinks"]) ||
      (allowDefaults ? defaultSiteSettings.socialLinks : []),
    copyright: (doc.copyright as string) || (allowDefaults ? defaultSiteSettings.copyright : ""),
    defaultSeo: {
      title: defaultSeo.title || (allowDefaults ? defaultSiteSettings.defaultSeo.title : ""),
      description:
        defaultSeo.description || (allowDefaults ? defaultSiteSettings.defaultSeo.description : ""),
    },
    utilityPageSeo:
      (doc.utilityPageSeo as CmsSiteSettings["utilityPageSeo"]) ||
      (allowDefaults ? defaultSiteSettings.utilityPageSeo : []),
    shopLabels: {
      breadcrumb:
        (shopLabels.breadcrumb as string) || (allowDefaults ? defaultSiteSettings.shopLabels.breadcrumb : ""),
      sortOptions: mapSortOptionLabels(shopLabels.sortOptions),
    },
    authLabels: {
      signInTitle: authLabels.signInTitle || (allowDefaults ? defaultSiteSettings.authLabels.signInTitle : ""),
      signInSubtitle:
        authLabels.signInSubtitle || (allowDefaults ? defaultSiteSettings.authLabels.signInSubtitle : ""),
      signUpTitle: authLabels.signUpTitle || (allowDefaults ? defaultSiteSettings.authLabels.signUpTitle : ""),
      signUpSubtitle:
        authLabels.signUpSubtitle || (allowDefaults ? defaultSiteSettings.authLabels.signUpSubtitle : ""),
    },
    paymentMethods: mapPaymentMethods(doc),
    merchantListing:
      (doc.merchantListing as CmsSiteSettings["merchantListing"]) ||
      defaultSiteSettings.merchantListing,
    showroom: mapShowroom(doc.showroom),
  };
}

function mapShowroom(raw: unknown): NonNullable<CmsSiteSettings["showroom"]> {
  const showroom = (raw as Record<string, unknown> | null | undefined) || {};
  return {
    enabled: Boolean(showroom.enabled),
    name: (showroom.name as string) || null,
    type:
      showroom.type === "SportingGoodsStore" ? "SportingGoodsStore" : "Store",
    streetAddress: (showroom.streetAddress as string) || null,
    addressLocality: (showroom.addressLocality as string) || null,
    addressRegion: (showroom.addressRegion as string) || null,
    postalCode: (showroom.postalCode as string) || null,
    addressCountry: (showroom.addressCountry as string) || null,
    telephone: (showroom.telephone as string) || null,
    latitude: typeof showroom.latitude === "number" ? showroom.latitude : null,
    longitude:
      typeof showroom.longitude === "number" ? showroom.longitude : null,
    openingHours: (showroom.openingHours as string) || null,
  };
}

function mapNavItem(item: Record<string, unknown>, id: number): CmsNavItem {
  const nested = ((item.submenu as Record<string, unknown>[]) || []).map(
    (sub, subIndex) => mapNavItem(sub, id * 10 + subIndex + 1)
  );

  return {
    id,
    title: item.title as string,
    path: item.path as string,
    newTab: Boolean(item.newTab),
    ...(item.mobileOnly ? { mobileOnly: true } : {}),
    ...(nested.length > 0 ? { submenu: nested } : {}),
  };
}

function mapNavigation(doc: Record<string, unknown> | null | undefined): CmsNavItem[] {
  const raw = doc?.items as Record<string, unknown>[] | null | undefined;
  if (raw == null) {
    return cmsDefaultsAllowed() ? defaultNavigation.items : emptyNavigation;
  }
  return raw.map((item, index) => mapNavItem(item, index + 1));
}

function mapFooter(doc: Record<string, unknown> | null | undefined): CmsFooter {
  if (!doc) {
    return cmsDefaultsAllowed() ? defaultFooter : emptyFooter;
  }
  const allowDefaults = cmsDefaultsAllowed();
  const mappedPreFooter = mapBlocks(doc.preFooterBlocks);
  return {
    preFooterBlocks:
      mappedPreFooter.length > 0
        ? mappedPreFooter
        : allowDefaults
          ? defaultFooter.preFooterBlocks
          : [],
    helpTitle:
      (doc.helpTitle as string) ||
      (allowDefaults ? defaultFooter.helpTitle : ""),
    columns:
      ((doc.columns as CmsFooter["columns"]) ||
        (allowDefaults ? defaultFooter.columns : [])),
    legalLinks:
      ((doc.legalLinks as CmsFooter["legalLinks"]) ||
        (allowDefaults ? defaultFooter.legalLinks : [])),
  };
}

function unavailableSiteSettings(): CmsSiteSettings {
  return cmsDefaultsAllowed() ? defaultSiteSettings : emptySiteSettings;
}

function unavailableNavigation(): CmsNavItem[] {
  return cmsDefaultsAllowed() ? defaultNavigation.items : emptyNavigation;
}

function unavailableFooter(): CmsFooter {
  return cmsDefaultsAllowed() ? defaultFooter : emptyFooter;
}

export const getSiteSettings = cache(async (): Promise<CmsSiteSettings> => {
  const payload = await getPayloadClient();
  if (!payload) {
    return unavailableSiteSettings();
  }
  try {
    const doc = await payload.findGlobal({ slug: "site-settings", depth: 2 });
    return mapSiteSettings(doc as unknown as Record<string, unknown>);
  } catch (error) {
    onCmsReadFailure("getSiteSettings", error);
    return unavailableSiteSettings();
  }
});

export const getNavigation = cache(async (): Promise<CmsNavItem[]> => {
  const payload = await getPayloadClient();
  if (!payload) {
    return unavailableNavigation();
  }
  try {
    const doc = await payload.findGlobal({ slug: "navigation", depth: 1 });
    return mapNavigation(doc as unknown as Record<string, unknown>);
  } catch (error) {
    onCmsReadFailure("getNavigation", error);
    return unavailableNavigation();
  }
});

export const getFooter = cache(async (): Promise<CmsFooter> => {
  const payload = await getPayloadClient();
  if (!payload) {
    return unavailableFooter();
  }
  try {
    const doc = await payload.findGlobal({ slug: "footer", depth: 2 });
    return mapFooter(doc as unknown as Record<string, unknown>);
  } catch (error) {
    onCmsReadFailure("getFooter", error);
    return unavailableFooter();
  }
});


export const getBlogPosts = cache(async (page = 1, limit = 9) => {
  const payload = await getPayloadClient();
  if (!payload) { return { posts: [] as CmsBlogPost[], totalPages: 0, totalDocs: 0 }; }
  try {
    const result = await payload.find({
      collection: "posts",
      page,
      limit,
      sort: "-publishedAt",
      depth: 2,
      where: { _status: { equals: "published" } },
    });
    const posts: CmsBlogPost[] = result.docs.map((doc) => {
      const d = doc as unknown as Record<string, unknown>;
      return {
        id: String(d.id),
        slug: d.slug as string,
        title: d.title as string,
        excerpt: (d.excerpt as string) || "",
        content: d.content,
        featuredImageUrl: getMediaUrl(d.featuredImage as never, "/images/blog/blog-01.jpg"),
        authorName: (d.authorName as string) || "Admin",
        publishedAt: (d.publishedAt as string) || "",
        updatedAt: (d.updatedAt as string) || (d.publishedAt as string) || "",
        views: (d.views as number) || 0,
        categories: ((d.categories as { name: string }[]) || []).map((c) => c.name),
        tags: ((d.tags as { name: string }[]) || []).map((t) => t.name),
      };
    });
    return {
      posts,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    };
  } catch {
    return { posts: [] as CmsBlogPost[], totalPages: 0, totalDocs: 0 };
  }
});

export const getBlogPostBySlug = cache(async (slug: string) => {
  const payload = await getPayloadClient();
  if (!payload) { return null; }
  try {
    const { docs } = await payload.find({
      collection: "posts",
      where: { slug: { equals: slug }, _status: { equals: "published" } },
      limit: 1,
      depth: 2,
    });
    const doc = docs[0] as unknown as Record<string, unknown> | undefined;
    if (!doc) { return null; }
    return {
      id: String(doc.id),
      slug: doc.slug as string,
      title: doc.title as string,
      excerpt: (doc.excerpt as string) || "",
      content: doc.content,
      featuredImageUrl: getMediaUrl(doc.featuredImage as never, "/images/blog/blog-01.jpg"),
      authorName: (doc.authorName as string) || "Admin",
      publishedAt: (doc.publishedAt as string) || "",
      updatedAt: (doc.updatedAt as string) || (doc.publishedAt as string) || "",
      views: (doc.views as number) || 0,
      categories: ((doc.categories as { name: string }[]) || []).map((c) => c.name),
      tags: ((doc.tags as { name: string }[]) || []).map((t) => t.name),
      seo: {
        title: (doc.seo as { title?: string })?.title || (doc.title as string),
        description: (doc.seo as { description?: string })?.description || "",
      },
    };
  } catch {
    return null;
  }
});

export async function getPageBySlug(slug: string): Promise<CmsPage | null> {
  const payload = await getPayloadClient();
  if (!payload) { return (cmsDefaultsAllowed() ? defaultPages[slug] : null) ?? null; }
  try {
    const draft = await draftMode();
    const { docs } = await payload.find({
      collection: "pages",
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 2,
      draft: draft.isEnabled,
    });
    const doc = docs[0] as unknown as Record<string, unknown> | undefined;
    if (!doc) { return (cmsDefaultsAllowed() ? defaultPages[slug] : null) ?? null; }
    const seo = (doc.seo as { title?: string; description?: string }) || {};
    return {
      slug: doc.slug as string,
      title: doc.title as string,
      layout: (doc.layout as string) || "generic",
      content: doc.content,
      blocks: mapBlocks(doc.blocks),
      livePreviewData: doc,
      heroImageUrl: getMediaUrl(doc.heroImage as never, "/images/404.svg"),
      contactName: (doc.contactName as string) || "",
      contactPhone: (doc.contactPhone as string) || "",
      contactEmail: (doc.contactEmail as string) || "",
      contactAddress: (doc.contactAddress as string) || "",
      seo: {
        title: seo.title || (doc.title as string),
        description: seo.description || "",
      },
    };
  } catch {
    return (cmsDefaultsAllowed() ? defaultPages[slug] : null) ?? null;
  }
}

export async function getProductContentByHandle(
  handle: string
): Promise<CmsProductContent | null> {
    const payload = await getPayloadClient();
    if (!payload) {
      return null;
    }

    try {
      const draft = await draftMode();
      const { docs } = await payload.find({
        collection: "productContent" as never,
        where: { handle: { equals: handle } },
        limit: 1,
        depth: 2,
        draft: draft.isEnabled,
      });

      const doc = docs[0] as unknown as Record<string, unknown> | undefined;
      if (!doc) {
        return null;
      }

      const seo = (doc.seo as { title?: string; description?: string }) || {};
      return {
        medusaProductId: (doc.medusaProductId as string) || "",
        handle: (doc.handle as string) || handle,
        title: (doc.title as string) || "",
        shortDescription: (doc.shortDescription as string)?.trim() || "",
        longDescription: (doc.longDescription as string)?.trim() || "",
        blocks: mapBlocks(doc.blocks),
        livePreviewData: doc,
        seo: {
          title: seo.title?.trim() || "",
          description: seo.description?.trim() || "",
        },
      };
    } catch {
      return null;
    }
}

function mapCategoryContentDoc(
  doc: Record<string, unknown>,
  handle: string
): CmsCategoryContent {
  const seo = (doc.seo as { title?: string; description?: string }) || {};

  return {
    medusaCategoryId: (doc.medusaCategoryId as string) || "",
    handle: (doc.handle as string) || handle,
    title: (doc.title as string) || "",
    kind:
      doc.kind === "pseudo"
        ? "pseudo"
        : doc.kind === "selection"
          ? "selection"
          : "medusa",
    route: (doc.route as string) || getPseudoCategoryByHandle(handle)?.route,
    filterQuery: (doc.filterQuery as string) || "",
    h1: (doc.h1 as string) || "",
    hideSubcategoryThumbs: Boolean(doc.hideSubcategoryThumbs),
    hideProductListing: Boolean(doc.hideProductListing),
    showCategoryFilter: Boolean(doc.showCategoryFilter),
    blocksAboveSubcategories: mapBlocks(doc.blocksAboveSubcategories),
    blocksBelowSubcategories: mapBlocks(doc.blocksBelowSubcategories),
    blocksBelowListing: mapBlocks(doc.blocksBelowListing),
    livePreviewData: doc,
    seo: {
      title: seo.title?.trim() || "",
      description: seo.description?.trim() || "",
    },
  };
}

export async function getCategoryContentByHandle(
  handle: string
): Promise<CmsCategoryContent | null> {
  const payload = await getPayloadClient();
  if (!payload) {
    return null;
  }

  try {
    const draft = await draftMode();
    const { docs } = await payload.find({
      collection: "categoryContent" as never,
      where: { handle: { equals: handle } },
      limit: 1,
      depth: 2,
      draft: draft.isEnabled,
    });

    const doc = docs[0] as unknown as Record<string, unknown> | undefined;
    if (!doc) {
      return null;
    }

    return mapCategoryContentDoc(doc, handle);
  } catch {
    return null;
  }
}

export const getCategoryContentByHandles = cache(
  async (handles: string[]): Promise<Map<string, CmsCategoryContent | null>> => {
    const uniqueHandles = Array.from(new Set(handles.filter(Boolean)));
    const result = new Map<string, CmsCategoryContent | null>();

    if (uniqueHandles.length === 0) {
      return result;
    }

    const payload = await getPayloadClient();
    if (!payload) {
      for (const handle of uniqueHandles) {
        result.set(handle, null);
      }
      return result;
    }

    try {
      const draft = await draftMode();
      const { docs } = await payload.find({
        collection: "categoryContent" as never,
        where: { handle: { in: uniqueHandles } },
        limit: uniqueHandles.length,
        depth: 0,
        draft: draft.isEnabled,
      });

      for (const doc of docs as unknown as Record<string, unknown>[]) {
        const handle = typeof doc.handle === "string" ? doc.handle : "";
        if (handle) {
          result.set(handle, mapCategoryContentDoc(doc, handle));
        }
      }

      for (const handle of uniqueHandles) {
        if (!result.has(handle)) {
          result.set(handle, null);
        }
      }
    } catch {
      for (const handle of uniqueHandles) {
        result.set(handle, null);
      }
    }

    return result;
  }
);

export const getPageBlocksBySlug = cache(async (slug: string): Promise<CmsBlock[]> => {
  const page = await getPageBySlug(slug);
  return page?.blocks || [];
});

export function getUtilitySeo(
  settings: CmsSiteSettings,
  route: string,
  fallback: { title: string; description: string; heading?: string; subheading?: string }
) {
  const match = settings.utilityPageSeo.find((item) => item.route === route);
  return {
    title: match?.title || fallback.title,
    description: match?.description || fallback.description,
    heading: match?.heading || fallback.heading,
    subheading: match?.subheading || fallback.subheading,
  };
}
