"use client";
import type { HttpTypes } from "@medusajs/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cmsSectionProps } from "@/components/cms/cms-section";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { hasActiveAnalytics, trackCustomEvent } from "@/lib/analytics";
import type { CmsNavItem, CmsSiteSettings } from "@/lib/cms/types";
import { buildSearchUrl } from "@/lib/search-url";
import { MobileMenu } from "./MobileMenu";
import { NavBar } from "./NavBar";
import SearchOverlay from "./SearchOverlay";
import { TopBar } from "./TopBar";

const Header = ({
  siteSettings,
  navigation,
  searchCategories,
  customer,
}: {
  siteSettings: CmsSiteSettings;
  navigation: CmsNavItem[];
  searchCategories: { label: string; value: string }[];
  customer: HttpTypes.StoreCustomer | null;
}) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState(
    searchCategories[0]?.value ?? "0",
  );
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [stickyMenu, setStickyMenu] = useState(false);

  const handleStickyMenu = () => {
    if (window.scrollY >= 80) {
      setStickyMenu(true);
    } else {
      setStickyMenu(false);
    }
  };

  useEffect(() => {
    window.addEventListener("scroll", handleStickyMenu);
  });

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (searchOverlayOpen && query && hasActiveAnalytics()) {
      trackCustomEvent("Catalog", "search_submit", "overlay");
    }
    router.push(buildSearchUrl({ query, categoryId: searchCategory }));
  };

  const navigateToSearchResults = () => {
    router.push(buildSearchUrl({ query: searchQuery, categoryId: searchCategory }));
  };

  useBodyScrollLock(navigationOpen);
  const closeNavigation = () => setNavigationOpen(false);

  useBodyScrollLock(searchOverlayOpen);
  const openSearch = () => {
    if (hasActiveAnalytics()) {
      trackCustomEvent("Catalog", "search_overlay_open", "header");
    }
    setSearchOverlayOpen(true);
  };
  const closeSearch = () => setSearchOverlayOpen(false);

  return (
    <header
      className={`fixed top-0 left-0 z-9999 w-full transition-all duration-300 ease-in-out ${
        stickyMenu && "shadow"
      }`}
      {...cmsSectionProps({ type: "header", global: "navigation" })}
    >
      <TopBar siteSettings={siteSettings} />
      <NavBar
        customer={customer}
        navigation={navigation}
        navigationOpen={navigationOpen}
        onOpenSearch={openSearch}
        onToggleNavigation={() => setNavigationOpen(!navigationOpen)}
        siteSettings={siteSettings}
        stickyMenu={stickyMenu}
      />
      <MobileMenu
        closeNavigation={closeNavigation}
        customer={customer}
        navigation={navigation}
        navigationOpen={navigationOpen}
        stickyMenu={stickyMenu}
      />
      <SearchOverlay
        navigateToSearchResults={navigateToSearchResults}
        onClose={closeSearch}
        onSearchSubmit={handleSearchSubmit}
        open={searchOverlayOpen}
        options={searchCategories}
        placeholder={siteSettings.searchPlaceholder}
        searchCategory={searchCategory}
        searchQuery={searchQuery}
        setSearchCategory={setSearchCategory}
        setSearchQuery={setSearchQuery}
      />
    </header>
  );
};

export default Header;
