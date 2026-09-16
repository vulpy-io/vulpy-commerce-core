import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { draftMode } from "next/headers";
import RefreshRouteOnSave from "@/components/cms/RefreshRouteOnSave";
import SiteLayoutClient from "@/components/Layout/SiteLayoutClient";
import {
  emptyFooter,
  emptyNavigation,
  emptySiteSettings,
} from "@/lib/cms/fallback";
import { getFooter, getNavigation, getSiteSettings } from "@/lib/cms/queries";
import { getStoreCart, getStoreCustomer, getStoreRegion } from "@/lib/data";
import {
  getCategoryNavigationItems,
  getSearchCategories,
  mergeNavigationWithCategories,
} from "@/lib/medusa/categories";
import {
  getDefaultLocale,
  rootSiteMetadata,
} from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const siteSettings = await getSiteSettings();
    return {
      ...rootSiteMetadata(),
      title: siteSettings.siteName.trim() || "Vulpy Commerce",
    };
  } catch {
    console.error("[generateMetadata] getSiteSettings failed — using fallback title");
    return {
      ...rootSiteMetadata(),
      title: "Vulpy Commerce",
    };
  }
}

export const viewport: Viewport = {
  viewportFit: "cover",
};

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isEnabled } = await draftMode();

  // Graceful degradation: wrap all data fetchers so a CMS/Medusa outage
  // produces an empty shell rather than a blank white page crash.
  let regionId = "";
  let currencyCode = "";
  try {
    const region = await getStoreRegion();
    regionId = region.regionId;
    currencyCode = region.currencyCode;
  } catch {
    console.error("[SiteLayout] getStoreRegion failed — using empty fallback");
  }

  const [storeCart, customer, siteSettings, customNavigation, footer, categoryNavigation, searchCategories] =
    await Promise.all([
      getStoreCart().catch(() => ({ cart: null, issues: [], checkoutBlocked: false })),
      getStoreCustomer().catch(() => null),
      getSiteSettings().catch(() => emptySiteSettings),
      getNavigation().catch(() => emptyNavigation),
      getFooter().catch(() => emptyFooter),
      getCategoryNavigationItems(regionId).catch(() => []),
      getSearchCategories(regionId).catch(() => []),
    ]);

  const navigation = mergeNavigationWithCategories(
    customNavigation,
    categoryNavigation,
    siteSettings.medusaCategoriesInNavigation
  );

  return (
    <html className={`${manrope.variable} ${sora.variable}`} lang={getDefaultLocale()} suppressHydrationWarning>
      <body className={manrope.className}>
        <SiteLayoutClient
          checkoutBlocked={storeCart.checkoutBlocked}
          currencyCode={currencyCode}
          customer={customer}
          footer={footer}
          initialCart={storeCart.cart}
          initialIssues={storeCart.issues}
          navigation={navigation}
          regionId={regionId}
          searchCategories={searchCategories}
          siteSettings={siteSettings}
        >
          {isEnabled ? <RefreshRouteOnSave /> : null}
          {children}
        </SiteLayoutClient>
      </body>
    </html>
  );
}