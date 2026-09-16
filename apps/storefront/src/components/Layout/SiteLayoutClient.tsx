"use client";

import type { HttpTypes } from "@medusajs/types";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { CartModalProvider } from "@/app/context/CartSidebarModalContext";
import { PreviewSliderProvider } from "@/app/context/PreviewSliderContext";
import { ModalProvider } from "@/app/context/QuickViewModalContext";
import AnalyticsRoot from "@/components/Analytics/AnalyticsRoot";
import AnalyticsUserIdSync from "@/components/Analytics/AnalyticsUserIdSync";
import CartSidebarModal from "@/components/Common/CartSidebarModal";
import HeaderHeightSync from "@/components/Common/HeaderHeightSync";
import PreLoader from "@/components/Common/PreLoader";
import PreviewSliderModal from "@/components/Common/PreviewSlider";
import QuickViewModal from "@/components/Common/QuickViewModal";
import ScrollToTop from "@/components/Common/ScrollToTop";
import TopLoadingBar from "@/components/Common/TopLoadingBar";
import ConsentBanner from "@/components/Consent/ConsentBanner";
import BlocksRenderer from "@/components/cms/BlocksRenderer";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import RecentlyViewedHydrator from "@/components/RecentlyViewed/RecentlyViewedHydrator";
import WishlistHydrator from "@/components/Wishlist/WishlistHydrator";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { ConsentProvider } from "@/context/ConsentContext";
import { StoreRegionProvider } from "@/context/StoreRegionContext";
import { hashAnalyticsUserId } from "@/lib/analytics";
import type { CmsFooter, CmsNavItem, CmsSiteSettings } from "@/lib/cms/types";
import type { CartIssue } from "@/lib/medusa/cart-issues";
import { ReduxProvider } from "@/redux/provider";
import "@/app/css/style.css";

function isMinimalCheckoutLayout(pathname: string): boolean {
  return (
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/") ||
    pathname === "/order/payment-return"
  );
}

function isSpecializedAnalyticsRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/products/") ||
    pathname === "/search" ||
    pathname.startsWith("/order/confirmed/")
  );
}

export default function SiteLayoutClient({
  children,
  customer,
  initialCart,
  initialIssues,
  checkoutBlocked,
  siteSettings,
  navigation,
  footer,
  regionId,
  currencyCode,
  searchCategories,
}: {
  children: React.ReactNode;
  customer: HttpTypes.StoreCustomer | null;
  initialCart: HttpTypes.StoreCart | null;
  initialIssues: CartIssue[];
  checkoutBlocked: boolean;
  siteSettings: CmsSiteSettings;
  navigation: CmsNavItem[];
  footer: CmsFooter;
  regionId: string;
  currencyCode: string;
  searchCategories: { label: string; value: string }[];
}) {
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const minimalLayout = isMinimalCheckoutLayout(pathname);
  const skipDefaultPageView = isSpecializedAnalyticsRoute(pathname);
  const customerIdHash = customer?.id ? hashAnalyticsUserId(customer.id) : null;

  // Transient only: the overlay is present for at most this long, and is
  // removed even if the effect below never runs (hydration stall / HMR / WS
  // failure). The real layout is ALWAYS in the DOM underneath — content is
  // never gated behind a JS timer.
  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <TopLoadingBar />
      </Suspense>
      {loading && !minimalLayout ? <PreLoader /> : null}
      <ConsentProvider>
        <AnalyticsRoot skipPageView={skipDefaultPageView}>
          <div className={minimalLayout ? undefined : "flex min-h-dvh flex-col"}>
          <div className={minimalLayout ? undefined : "flex-1"}>
          <ReduxProvider>
            <WishlistHydrator />
            <RecentlyViewedHydrator />
            <AuthProvider isLoggedIn={Boolean(customer)}>
              <AnalyticsUserIdSync customerIdHash={customerIdHash} />
              <StoreRegionProvider currencyCode={currencyCode} regionId={regionId}>
                <CartProvider
                  initialCart={initialCart}
                  initialCheckoutBlocked={checkoutBlocked}
                  initialIssues={initialIssues}
                >
                  <CartModalProvider>
                    <ModalProvider>
                      <PreviewSliderProvider>
                        {minimalLayout ? null : (
                          <>
                            <Header
                              customer={customer}
                              navigation={navigation}
                              searchCategories={searchCategories}
                              siteSettings={siteSettings}
                            />
                            <HeaderHeightSync />
                          </>
                        )}
                        {children}
                        <QuickViewModal regionId={regionId} />
                        <CartSidebarModal
                          hideCart={siteSettings.hideCart}
                          paymentMethods={siteSettings.paymentMethods}
                        />
                        <PreviewSliderModal />
                      </PreviewSliderProvider>
                    </ModalProvider>
                  </CartModalProvider>
                </CartProvider>
              </StoreRegionProvider>
            </AuthProvider>
          </ReduxProvider>
          {minimalLayout ? null : <ScrollToTop />}
          {!minimalLayout && footer.preFooterBlocks.length > 0 ? (
            <BlocksRenderer blocks={footer.preFooterBlocks} context="footer-pre" />
          ) : null}
          </div>
          {minimalLayout ? null : (
            <Footer footer={footer} siteSettings={siteSettings} />
          )}
          </div>
          <ConsentBanner />
          <Toaster position="top-right" />
        </AnalyticsRoot>
      </ConsentProvider>
    </>
  );
}
