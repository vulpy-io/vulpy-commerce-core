"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { useCanSeePrices } from "@/context/AuthContext";
import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useShopCatalogInfiniteScroll } from "@/hooks/useShopCatalogInfiniteScroll";
import {
  catalogListIdentity,
  trackFilterApplied,
  trackPageChanged,
  trackSortChanged,
} from "@/lib/analytics";
import type { CmsSiteSettings } from "@/lib/cms/types";
import { getCurrencySymbol } from "@/lib/medusa/money";
import {
  getShopSortLabel,
  SHOP_SORT_VALUES,
  type ShopSortValue,
} from "@/lib/medusa/shop-display";
import {
  createDefaultFilters,
  getAttributeFilterLabel,
} from "@/lib/medusa/shop-filters";
import { buildShopCatalogHref } from "@/lib/medusa/shop-query";
import type { Category } from "@/types/category";
import type { ShopFilterFacets, ShopFilters, ShopProduct } from "@/types/shop";
import PageLayout, { type BreadcrumbItem } from "../Common/PageLayout";
import Categories from "../Home/Categories";
import SingleGridItem from "../Shop/SingleGridItem";
import SingleListItem from "../Shop/SingleListItem";
import AttributeFilterDropdown from "./AttributeFilterDropdown";
import CatalogPagination from "./CatalogPagination";
import CategoryDropdown from "./CategoryDropdown";
import CustomSelect from "./CustomSelect";
import PriceDropdown from "./PriceDropdown";
import SizeDropdown from "./SizeDropdown";

function emitFilterDiff(
  previous: ShopFilters,
  next: ShopFilters,
  defaults: ShopFilters
): void {
  if (next.categoryIds.join(",") !== previous.categoryIds.join(",")) {
    trackFilterApplied(
      "category",
      next.categoryIds.length ? next.categoryIds.join(",") : "cleared"
    );
  }
  if (next.sizes.join(",") !== previous.sizes.join(",")) {
    trackFilterApplied("size", next.sizes.length ? next.sizes.join(",") : "cleared");
  }
  if (next.colors.join(",") !== previous.colors.join(",")) {
    trackFilterApplied(
      "color",
      next.colors.length ? next.colors.join(",") : "cleared"
    );
  }
  if (next.saleOnly !== previous.saleOnly) {
    trackFilterApplied("sale", next.saleOnly ? "only" : "cleared");
  }
  if (next.priceMin !== previous.priceMin || next.priceMax !== previous.priceMax) {
    const atDefault =
      next.priceMin === defaults.priceMin && next.priceMax === defaults.priceMax;
    trackFilterApplied(
      "price",
      atDefault ? "cleared" : `${next.priceMin}-${next.priceMax}`
    );
  }
  const prevAttrs = Object.keys(previous.attributes).sort();
  const nextAttrs = Object.keys(next.attributes).sort();
  const attrKeys = Array.from(new Set([...prevAttrs, ...nextAttrs]));
  for (const key of attrKeys) {
    const prevVal = (previous.attributes[key] ?? []).join(",");
    const nextVal = (next.attributes[key] ?? []).join(",");
    if (prevVal !== nextVal) {
      trackFilterApplied(`attr_${key}`, nextVal || "cleared");
    }
  }
}

const ShopWithSidebar = ({
  products,
  facets,
  filters,
  sort,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  catalogPath,
  pageTitle,
  breadcrumbItems,
  breadcrumbCurrentPath,
  childCategories,
  categoryHandle,
  regionId,
  shopLabels,
  showCategoryFilter = false,
  catalogScope,
  selectionHandle,
  hideSubcategoryThumbs = false,
  hideProductListing = false,
  contentAboveSubcategories,
  contentBelowSubcategories,
  contentBelowListing,
}: {
  products: ShopProduct[];
  facets: ShopFilterFacets;
  filters: ShopFilters;
  sort: ShopSortValue;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  catalogPath: string;
  pageTitle?: string;
  breadcrumbItems?: BreadcrumbItem[];
  breadcrumbCurrentPath?: string;
  childCategories?: Category[];
  categoryHandle?: string;
  regionId: string;
  shopLabels: CmsSiteSettings["shopLabels"];
  showCategoryFilter?: boolean;
  catalogScope?: "shop" | "sale" | "selection";
  selectionHandle?: string;
  hideSubcategoryThumbs?: boolean;
  hideProductListing?: boolean;
  contentAboveSubcategories?: ReactNode;
  contentBelowSubcategories?: ReactNode;
  contentBelowListing?: ReactNode;
}) => {
  const router = useRouter();
  const canSeePrices = useCanSeePrices();
  const hasAnalytics = useHasAnalyticsConsent();
  const [isPending, startTransition] = useTransition();
  const [productStyle, setProductStyle] = useState("grid");
  const [productSidebar, setProductSidebar] = useState(false);
  const [stickyMenu, setStickyMenu] = useState(false);
  const { visibleProducts, loadedPage, isLoadingMore, hasMore, loadMoreRef } =
    useShopCatalogInfiniteScroll({
      initialProducts: products,
      initialPage: currentPage,
      totalPages,
      sort,
      filters,
      categoryHandle,
      catalogScope,
      selectionHandle,
    });

  const defaultFilters = createDefaultFilters(facets);
  const currencySymbol = getCurrencySymbol(useStoreCurrency());
  const { listId, listName } = catalogListIdentity({
    categoryHandle,
    catalogScope,
    selectionHandle,
    pageTitle,
  });

  const navigateCatalog = (next: {
    page?: number;
    sort?: ShopSortValue;
    filters?: ShopFilters;
  }) => {
    const nextPage = next.page ?? currentPage;
    const nextSort = next.sort ?? sort;
    const nextFilters = next.filters ?? filters;

    if (hasAnalytics) {
      if (next.sort && next.sort !== sort) {
        trackSortChanged(next.sort);
      }
      if (next.page != null && next.page !== currentPage) {
        trackPageChanged(next.page, listId);
      }
      if (next.filters) {
        emitFilterDiff(filters, next.filters, defaultFilters);
      }
    }

    startTransition(() => {
      router.push(
        buildShopCatalogHref(catalogPath, {
          page: nextPage,
          sort: nextSort,
          filters: nextFilters,
          priceDefaults: {
            priceMin: defaultFilters.priceMin,
            priceMax: defaultFilters.priceMax,
          },
        }),
        { scroll: false }
      );
    });
  };

  const handleStickyMenu = () => {
    if (window.scrollY >= 80) {
      setStickyMenu(true);
    } else {
      setStickyMenu(false);
    }
  };

  const options = SHOP_SORT_VALUES.map((value) => ({
    label: getShopSortLabel(value, shopLabels.sortOptions),
    value,
  }));
  const hasActiveFilters =
    filters.categoryIds.length > 0 ||
    filters.sizes.length > 0 ||
    filters.colors.length > 0 ||
    filters.finishes.length > 0 ||
    filters.saleOnly ||
    Object.values(filters.attributes).some((values) => values.length > 0) ||
    filters.priceMin !== defaultFilters.priceMin ||
    filters.priceMax !== defaultFilters.priceMax;

  const clearFilters = () => {
    navigateCatalog({ page: 1, filters: defaultFilters });
  };

  useBodyScrollLock(productSidebar);

  const pageEyebrow =
    catalogScope === "sale"
      ? "Sale"
      : catalogScope === "selection"
        ? "Selection"
        : undefined;

  const updateFilters = (updater: (current: ShopFilters) => ShopFilters) => {
    navigateCatalog({ page: 1, filters: updater(filters) });
  };

  type ActiveFilterChip = {
    key: string;
    label: string;
    onRemove: () => void;
  };

  const categoryNameById = new Map(
    facets.categories.map((category) => [category.id, category.name])
  );

  const activeFilterChips: ActiveFilterChip[] = [];

  for (const categoryId of filters.categoryIds) {
    activeFilterChips.push({
      key: `category-${categoryId}`,
      label: `Category: ${categoryNameById.get(categoryId) ?? categoryId}`,
      onRemove: () =>
        updateFilters((current) => ({
          ...current,
          categoryIds: current.categoryIds.filter((id) => id !== categoryId),
        })),
    });
  }

  for (const size of filters.sizes) {
    activeFilterChips.push({
      key: `size-${size}`,
      label: `Size: ${size}`,
      onRemove: () =>
        updateFilters((current) => ({
          ...current,
          sizes: current.sizes.filter((value) => value !== size),
        })),
    });
  }

  for (const color of filters.colors) {
    activeFilterChips.push({
      key: `color-${color}`,
      label: `Color: ${color}`,
      onRemove: () =>
        updateFilters((current) => ({
          ...current,
          colors: current.colors.filter((value) => value !== color),
        })),
    });
  }

  for (const finish of filters.finishes) {
    activeFilterChips.push({
      key: `finish-${finish}`,
      label: `Finish: ${finish}`,
      onRemove: () =>
        updateFilters((current) => ({
          ...current,
          finishes: current.finishes.filter((value) => value !== finish),
        })),
    });
  }

  if (filters.saleOnly) {
    activeFilterChips.push({
      key: "sale",
      label: "Sale",
      onRemove: () =>
        updateFilters((current) => ({ ...current, saleOnly: false })),
    });
  }

  if (
    filters.priceMin !== defaultFilters.priceMin ||
    filters.priceMax !== defaultFilters.priceMax
  ) {
    activeFilterChips.push({
      key: "price",
      label: `Price: ${currencySymbol}${filters.priceMin} – ${currencySymbol}${filters.priceMax}`,
      onRemove: () =>
        updateFilters((current) => ({
          ...current,
          priceMin: defaultFilters.priceMin,
          priceMax: defaultFilters.priceMax,
        })),
    });
  }

  for (const [attributeKey, values] of Object.entries(filters.attributes)) {
    for (const value of values) {
      activeFilterChips.push({
        key: `attr-${attributeKey}-${value}`,
        label: `${getAttributeFilterLabel(attributeKey)}: ${value}`,
        onRemove: () =>
          updateFilters((current) => ({
            ...current,
            attributes: {
              ...current.attributes,
              [attributeKey]: (current.attributes[attributeKey] ?? []).filter(
                (item) => item !== value
              ),
            },
          })),
      });
    }
  }

  useEffect(() => {
    window.addEventListener("scroll", handleStickyMenu);

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (
        !(target?.closest(".sidebar-content") ||target?.closest('[aria-label="Close filters"], [aria-label="Open filters"]'))
      ) {
        setProductSidebar(false);
      }
    }

    if (productSidebar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      window.removeEventListener("scroll", handleStickyMenu);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [productSidebar, handleStickyMenu]);

  return (
    <PageLayout
      breadcrumbCurrentPath={breadcrumbCurrentPath}
      breadcrumbItems={breadcrumbItems}
      breadcrumbVariant="compact"
      includeBreadcrumbJsonLd={false}
      pages={breadcrumbItems ? undefined : ["Catalog"]}
      title={pageTitle ?? shopLabels.breadcrumb}
    >
      <section className="relative overflow-hidden bg-white pt-2 pb-20 lg:pt-4">
        <div className="border-border-subtle border-b py-5 lg:py-7">
          <div className="container w-full">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div>
                {pageEyebrow ? (
                  <p className="font-bold text-[12px] text-content-secondary uppercase tracking-[0.06em]">
                    {pageEyebrow}
                  </p>
                ) : null}
                <h1 className="h1">
                  {pageTitle ?? shopLabels.breadcrumb}
                </h1>
              </div>
            </div>
          </div>
        </div>
        {contentAboveSubcategories}
        {hideProductListing ? null : (
          <div className="sticky top-[var(--header-height)] z-50 mb-4 xl:hidden">
            <button
              aria-expanded={productSidebar}
              aria-label={productSidebar ? "Close filters" : "Open filters"}
              className={`fixed top-[var(--header-height)] left-0 z-9999 flex h-10 w-10 items-center justify-center rounded-none transition-transform duration-200 ease-out ${
                productSidebar
                  ? "bg-action-primary-background text-white"
                  : "border border-gray-3 bg-gray-2 text-content-primary"
              } ${
                productSidebar ? "translate-x-[min(100vw-2.5rem,310px)]" : "translate-x-0"
              }`}
              onClick={() => setProductSidebar(!productSidebar)}
              type="button"
            >
              {productSidebar ? (
                <svg
                  fill="none"
                  height="18"
                  viewBox="0 0 18 18"
                  width="18"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  />
                </svg>
              ) : (
                <svg
                  className="fill-current"
                  fill="none"
                  height="20"
                  viewBox="0 0 24 24"
                  width="20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    clipRule="evenodd"
                    d="M10.0068 3.44714C10.3121 3.72703 10.3328 4.20146 10.0529 4.5068L5.70494 9.25H20C20.4142 9.25 20.75 9.58579 20.75 10C20.75 10.4142 20.4142 10.75 20 10.75H4.00002C3.70259 10.75 3.43327 10.5742 3.3135 10.302C3.19374 10.0298 3.24617 9.71246 3.44715 9.49321L8.94715 3.49321C9.22704 3.18787 9.70147 3.16724 10.0068 3.44714Z"
                    fill=""
                    fillRule="evenodd"
                  />
                  <path
                    clipRule="evenodd"
                    d="M20.6865 13.698C20.5668 13.4258 20.2974 13.25 20 13.25L4.00001 13.25C3.5858 13.25 3.25001 13.5858 3.25001 14C3.25001 14.4142 3.5858 14.75 4.00001 14.75L18.2951 14.75L13.9472 19.4932C13.6673 19.7985 13.6879 20.273 13.9932 20.5529C14.2986 20.8328 14.773 20.8121 15.0529 20.5068L20.5529 14.5068C20.7539 14.2876 20.8063 13.9703 20.6865 13.698Z"
                    fill=""
                    fillRule="evenodd"
                  />
                </svg>
              )}
            </button>
          </div>
        )}
        {!hideSubcategoryThumbs && childCategories && childCategories.length > 0 ? (
          <Categories
            categories={childCategories}
            className="pt-0"
            eyebrow=""
            showHeader={false}
            title=""
            variant="embedded"
          />
        ) : null}
        {contentBelowSubcategories}
        {hideProductListing ? null : (
        <div className="container w-full">
          <div className="flex gap-7.5">
            {/* <!-- Sidebar Start --> */}
            <div
              className={`sidebar-content fixed top-0 left-0 z-9999 w-full max-w-[310px] duration-200 ease-out xl:static xl:z-1 xl:max-w-[270px] xl:translate-x-0 ${
                productSidebar
                  ? "h-dvh translate-x-0 overflow-y-auto bg-white p-5"
                  : "-translate-x-full"
              }`}
            >
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="flex flex-col gap-6">
                  {/* <!-- filter box --> */}
                  <div className="rounded-panel bg-white px-5 py-4 shadow-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-[11px] text-content-primary uppercase tracking-[0.14em]">
                        Filters
                      </p>
                      {hasActiveFilters ? (
                        <button
                          className="font-bold text-[11px] text-content-muted uppercase tracking-[0.1em] duration-200 ease-out hover:text-content-primary"
                          onClick={clearFilters}
                          type="button"
                        >
                          Clear all
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {showCategoryFilter ? (
                    <CategoryDropdown
                      categories={facets.categories}
                      onChange={(categoryIds) =>
                        updateFilters((current) => ({ ...current, categoryIds }))
                      }
                      selectedCategoryIds={filters.categoryIds}
                    />
                  ) : null}

                  {facets.sizes.length > 0 ? (
                    <SizeDropdown
                      onChange={(sizes) =>
                        updateFilters((current) => ({ ...current, sizes }))
                      }
                      selectedSizes={filters.sizes}
                      sizes={facets.sizes}
                    />
                  ) : null}

                  {facets.colors?.length > 0 ? (
                    <AttributeFilterDropdown
                      label="Color"
                      onChange={(colors) =>
                        updateFilters((current) => ({ ...current, colors }))
                      }
                      selectedValues={filters.colors}
                      showSwatches
                      values={facets.colors}
                    />
                  ) : null}

                  {Object.entries(facets.attributes).map(([key, values]) =>
                    values.length > 0 ? (
                      <AttributeFilterDropdown
                        key={key}
                        label={getAttributeFilterLabel(key)}
                        onChange={(selectedValues) =>
                          updateFilters((current) => ({
                            ...current,
                            attributes: {
                              ...current.attributes,
                              [key]: selectedValues,
                            },
                          }))
                        }
                        selectedValues={filters.attributes[key] ?? []}
                        values={values}
                      />
                    ) : null
                  )}

                  {canSeePrices ? (
                    <PriceDropdown
                      max={facets.priceMax}
                      min={facets.priceMin}
                      onChange={({ min, max }) =>
                        updateFilters((current) => ({
                          ...current,
                          priceMin: min,
                          priceMax: max,
                        }))
                      }
                      selectedMax={filters.priceMax}
                      selectedMin={filters.priceMin}
                    />
                  ) : null}
                </div>
              </form>
            </div>
            {/* // <!-- Sidebar End --> */}

            {/* // <!-- Content Start --> */}
            <div className="w-full">
              <div className="mb-6 border-border-subtle border-b py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-custom-sm md:order-2">
                    Showing{" "}
                    <span className="text-content-primary">
                      {visibleProducts.length} of {totalCount}
                    </span>{" "}
                    products
                    {isPending || isLoadingMore ? " …" : null}
                  </p>

                  <div className="flex items-center justify-between gap-3 md:contents">
                    <div className="min-w-0 md:order-3">
                      <CustomSelect
                        onChange={(value) => {
                          navigateCatalog({
                            page: 1,
                            sort: value as ShopSortValue,
                          });
                        }}
                        options={options}
                        value={sort}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 md:order-2">
                    <button
                      aria-label="Grid view"
                      className={`${
                        productStyle === "grid"
                          ? "border-action-primary-background bg-action-primary-background text-white"
                          : "border-border-subtle bg-surface-muted text-content-primary"
                      } flex h-9 w-10.5 items-center justify-center rounded-control border duration-200 ease-out hover:border-action-primary-background hover:bg-action-primary-background hover:text-white`}
                      onClick={() => setProductStyle("grid")}
                    >
                      <svg
                        className="fill-current"
                        fill="none"
                        height="18"
                        viewBox="0 0 18 18"
                        width="18"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          clipRule="evenodd"
                          d="M4.836 1.3125C4.16215 1.31248 3.60022 1.31246 3.15414 1.37244C2.6833 1.43574 2.2582 1.57499 1.91659 1.91659C1.57499 2.2582 1.43574 2.6833 1.37244 3.15414C1.31246 3.60022 1.31248 4.16213 1.3125 4.83598V4.914C1.31248 5.58785 1.31246 6.14978 1.37244 6.59586C1.43574 7.06671 1.57499 7.49181 1.91659 7.83341C2.2582 8.17501 2.6833 8.31427 3.15414 8.37757C3.60022 8.43754 4.16213 8.43752 4.83598 8.4375H4.914C5.58785 8.43752 6.14978 8.43754 6.59586 8.37757C7.06671 8.31427 7.49181 8.17501 7.83341 7.83341C8.17501 7.49181 8.31427 7.06671 8.37757 6.59586C8.43754 6.14978 8.43752 5.58787 8.4375 4.91402V4.83601C8.43752 4.16216 8.43754 3.60022 8.37757 3.15414C8.31427 2.6833 8.17501 2.2582 7.83341 1.91659C7.49181 1.57499 7.06671 1.43574 6.59586 1.37244C6.14978 1.31246 5.58787 1.31248 4.91402 1.3125H4.836ZM2.71209 2.71209C2.80983 2.61435 2.95795 2.53394 3.30405 2.4874C3.66632 2.4387 4.15199 2.4375 4.875 2.4375C5.59801 2.4375 6.08368 2.4387 6.44596 2.4874C6.79205 2.53394 6.94018 2.61435 7.03791 2.71209C7.13565 2.80983 7.21607 2.95795 7.2626 3.30405C7.31131 3.66632 7.3125 4.15199 7.3125 4.875C7.3125 5.59801 7.31131 6.08368 7.2626 6.44596C7.21607 6.79205 7.13565 6.94018 7.03791 7.03791C6.94018 7.13565 6.79205 7.21607 6.44596 7.2626C6.08368 7.31131 5.59801 7.3125 4.875 7.3125C4.15199 7.3125 3.66632 7.31131 3.30405 7.2626C2.95795 7.21607 2.80983 7.13565 2.71209 7.03791C2.61435 6.94018 2.53394 6.79205 2.4874 6.44596C2.4387 6.08368 2.4375 5.59801 2.4375 4.875C2.4375 4.15199 2.4387 3.66632 2.4874 3.30405C2.53394 2.95795 2.61435 2.80983 2.71209 2.71209Z"
                          fill=""
                          fillRule="evenodd"
                        />
                        <path
                          clipRule="evenodd"
                          d="M13.086 9.5625C12.4121 9.56248 11.8502 9.56246 11.4041 9.62244C10.9333 9.68574 10.5082 9.82499 10.1666 10.1666C9.82499 10.5082 9.68574 10.9333 9.62244 11.4041C9.56246 11.8502 9.56248 12.4121 9.5625 13.086V13.164C9.56248 13.8379 9.56246 14.3998 9.62244 14.8459C9.68574 15.3167 9.82499 15.7418 10.1666 16.0834C10.5082 16.425 10.9333 16.5643 11.4041 16.6276C11.8502 16.6875 12.4121 16.6875 13.0859 16.6875H13.164C13.8378 16.6875 14.3998 16.6875 14.8459 16.6276C15.3167 16.5643 15.7418 16.425 16.0834 16.0834C16.425 15.7418 16.5643 15.3167 16.6276 14.8459C16.6875 14.3998 16.6875 13.8379 16.6875 13.1641V13.086C16.6875 12.4122 16.6875 11.8502 16.6276 11.4041C16.5643 10.9333 16.425 10.5082 16.0834 10.1666C15.7418 9.82499 15.3167 9.68574 14.8459 9.62244C14.3998 9.56246 13.8379 9.56248 13.164 9.5625H13.086ZM10.9621 10.9621C11.0598 10.8644 11.208 10.7839 11.554 10.7374C11.9163 10.6887 12.402 10.6875 13.125 10.6875C13.848 10.6875 14.3337 10.6887 14.696 10.7374C15.0421 10.7839 15.1902 10.8644 15.2879 10.9621C15.3857 11.0598 15.4661 11.208 15.5126 11.554C15.5613 11.9163 15.5625 12.402 15.5625 13.125C15.5625 13.848 15.5613 14.3337 15.5126 14.696C15.4661 15.0421 15.3857 15.1902 15.2879 15.2879C15.1902 15.3857 15.0421 15.4661 14.696 15.5126C14.3337 15.5613 13.848 15.5625 13.125 15.5625C12.402 15.5625 11.9163 15.5613 11.554 15.5126C11.208 15.4661 11.0598 15.3857 10.9621 15.2879C10.8644 15.1902 10.7839 15.0421 10.7374 14.696C10.6887 14.3337 10.6875 13.848 10.6875 13.125C10.6875 12.402 10.6887 11.9163 10.7374 11.554C10.7839 11.208 10.8644 11.0598 10.9621 10.9621Z"
                          fill=""
                          fillRule="evenodd"
                        />
                        <path
                          clipRule="evenodd"
                          d="M4.836 9.5625H4.914C5.58786 9.56248 6.14978 9.56246 6.59586 9.62244C7.06671 9.68574 7.49181 9.82499 7.83341 10.1666C8.17501 10.5082 8.31427 10.9333 8.37757 11.4041C8.43754 11.8502 8.43752 12.4121 8.4375 13.086V13.164C8.43752 13.8378 8.43754 14.3998 8.37757 14.8459C8.31427 15.3167 8.17501 15.7418 7.83341 16.0834C7.49181 16.425 7.06671 16.5643 6.59586 16.6276C6.14979 16.6875 5.58789 16.6875 4.91405 16.6875H4.83601C4.16217 16.6875 3.60022 16.6875 3.15414 16.6276C2.6833 16.5643 2.2582 16.425 1.91659 16.0834C1.57499 15.7418 1.43574 15.3167 1.37244 14.8459C1.31246 14.3998 1.31248 13.8379 1.3125 13.164V13.086C1.31248 12.4122 1.31246 11.8502 1.37244 11.4041C1.43574 10.9333 1.57499 10.5082 1.91659 10.1666C2.2582 9.82499 2.6833 9.68574 3.15414 9.62244C3.60023 9.56246 4.16214 9.56248 4.836 9.5625ZM3.30405 10.7374C2.95795 10.7839 2.80983 10.8644 2.71209 10.9621C2.61435 11.0598 2.53394 11.208 2.4874 11.554C2.4387 11.9163 2.4375 12.402 2.4375 13.125C2.4375 13.848 2.4387 14.3337 2.4874 14.696C2.53394 15.0421 2.61435 15.1902 2.71209 15.2879C2.80983 15.3857 2.95795 15.4661 3.30405 15.5126C3.66632 15.5613 4.15199 15.5625 4.875 15.5625C5.59801 15.5625 6.08368 15.5613 6.44596 15.5126C6.79205 15.4661 6.94018 15.3857 7.03791 15.2879C7.13565 15.1902 7.21607 15.0421 7.2626 14.696C7.31131 14.3337 7.3125 13.848 7.3125 13.125C7.3125 12.402 7.31131 11.9163 7.2626 11.554C7.21607 11.208 7.13565 11.0598 7.03791 10.9621C6.94018 10.8644 6.79205 10.7839 6.44596 10.7374C6.08368 10.6887 5.59801 10.6875 4.875 10.6875C4.15199 10.6875 3.66632 10.6887 3.30405 10.7374Z"
                          fill=""
                          fillRule="evenodd"
                        />
                        <path
                          clipRule="evenodd"
                          d="M13.086 1.3125C12.4122 1.31248 11.8502 1.31246 11.4041 1.37244C10.9333 1.43574 10.5082 1.57499 10.1666 1.91659C9.82499 2.2582 9.68574 2.6833 9.62244 3.15414C9.56246 3.60023 9.56248 4.16214 9.5625 4.836V4.914C9.56248 5.58786 9.56246 6.14978 9.62244 6.59586C9.68574 7.06671 9.82499 7.49181 10.1666 7.83341C10.5082 8.17501 10.9333 8.31427 11.4041 8.37757C11.8502 8.43754 12.4121 8.43752 13.086 8.4375H13.164C13.8378 8.43752 14.3998 8.43754 14.8459 8.37757C15.3167 8.31427 15.7418 8.17501 16.0834 7.83341C16.425 7.49181 16.5643 7.06671 16.6276 6.59586C16.6875 6.14978 16.6875 5.58787 16.6875 4.91402V4.83601C16.6875 4.16216 16.6875 3.60022 16.6276 3.15414C16.5643 2.6833 16.425 2.2582 16.0834 1.91659C15.7418 1.57499 15.3167 1.43574 14.8459 1.37244C14.3998 1.31246 13.8379 1.31248 13.164 1.3125H13.086ZM10.9621 2.71209C11.0598 2.61435 11.208 2.53394 11.554 2.4874C11.9163 2.4387 12.402 2.4375 13.125 2.4375C13.848 2.4375 14.3337 2.4387 14.696 2.4874C15.0421 2.53394 15.1902 2.61435 15.2879 2.71209C15.3857 2.80983 15.4661 2.95795 15.5126 3.30405C15.5613 3.66632 15.5625 4.15199 15.5625 4.875C15.5625 5.59801 15.5613 6.08368 15.5126 6.44596C15.4661 6.79205 15.3857 6.94018 15.2879 7.03791C15.1902 7.13565 15.0421 7.21607 14.696 7.2626C14.3337 7.31131 13.848 7.3125 13.125 7.3125C12.402 7.3125 11.9163 7.31131 11.554 7.2626C11.208 7.21607 11.0598 7.13565 10.9621 7.03791C10.8644 6.94018 10.7839 6.79205 10.7374 6.44596C10.6887 6.08368 10.6875 5.59801 10.6875 4.875C10.6875 4.15199 10.6887 3.66632 10.7374 3.30405C10.7839 2.95795 10.8644 2.80983 10.9621 2.71209Z"
                          fill=""
                          fillRule="evenodd"
                        />
                      </svg>
                    </button>

                    <button
                      aria-label="List view"
                      className={`${
                        productStyle === "list"
                          ? "border-action-primary-background bg-action-primary-background text-white"
                          : "border-border-subtle bg-surface-muted text-content-primary"
                      } flex h-9 w-10.5 items-center justify-center rounded-control border duration-200 ease-out hover:border-action-primary-background hover:bg-action-primary-background hover:text-white`}
                      onClick={() => setProductStyle("list")}
                    >
                      <svg
                        className="fill-current"
                        fill="none"
                        height="18"
                        viewBox="0 0 18 18"
                        width="18"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          clipRule="evenodd"
                          d="M4.4234 0.899903C3.74955 0.899882 3.18763 0.899864 2.74155 0.959838C2.2707 1.02314 1.8456 1.16239 1.504 1.504C1.16239 1.8456 1.02314 2.2707 0.959838 2.74155C0.899864 3.18763 0.899882 3.74953 0.899903 4.42338V4.5014C0.899882 5.17525 0.899864 5.73718 0.959838 6.18326C1.02314 6.65411 1.16239 7.07921 1.504 7.42081C1.8456 7.76241 2.2707 7.90167 2.74155 7.96497C3.18763 8.02495 3.74953 8.02493 4.42339 8.02491H4.5014C5.17525 8.02493 14.7372 8.02495 15.1833 7.96497C15.6541 7.90167 16.0792 7.76241 16.4208 7.42081C16.7624 7.07921 16.9017 6.65411 16.965 6.18326C17.0249 5.73718 17.0249 5.17527 17.0249 4.50142V4.42341C17.0249 3.74956 17.0249 3.18763 16.965 2.74155C16.9017 2.2707 16.7624 1.8456 16.4208 1.504C16.0792 1.16239 15.6541 1.02314 15.1833 0.959838C14.7372 0.899864 5.17528 0.899882 4.50142 0.899903H4.4234ZM2.29949 2.29949C2.39723 2.20175 2.54535 2.12134 2.89145 2.07481C3.25373 2.0261 3.7394 2.0249 4.4624 2.0249C5.18541 2.0249 14.6711 2.0261 15.0334 2.07481C15.3795 2.12134 15.5276 2.20175 15.6253 2.29949C15.7231 2.39723 15.8035 2.54535 15.85 2.89145C15.8987 3.25373 15.8999 3.7394 15.8999 4.4624C15.8999 5.18541 15.8987 5.67108 15.85 6.03336C15.8035 6.37946 15.7231 6.52758 15.6253 6.62532C15.5276 6.72305 15.3795 6.80347 15.0334 6.85C14.6711 6.89871 5.18541 6.8999 4.4624 6.8999C3.7394 6.8999 3.25373 6.89871 2.89145 6.85C2.54535 6.80347 2.39723 6.72305 2.29949 6.62532C2.20175 6.52758 2.12134 6.37946 2.07481 6.03336C2.0261 5.67108 2.0249 5.18541 2.0249 4.4624C2.0249 3.7394 2.0261 3.25373 2.07481 2.89145C2.12134 2.54535 2.20175 2.39723 2.29949 2.29949Z"
                          fill=""
                          fillRule="evenodd"
                        />
                        <path
                          clipRule="evenodd"
                          d="M4.4234 9.1499H4.5014C5.17526 9.14988 14.7372 9.14986 15.1833 9.20984C15.6541 9.27314 16.0792 9.41239 16.4208 9.754C16.7624 10.0956 16.9017 10.5207 16.965 10.9915C17.0249 11.4376 17.0249 11.9995 17.0249 12.6734V12.7514C17.0249 13.4253 17.0249 13.9872 16.965 14.4333C16.9017 14.9041 16.7624 15.3292 16.4208 15.6708C16.0792 16.0124 15.6541 16.1517 15.1833 16.215C14.7372 16.2749 5.17529 16.2749 4.50145 16.2749H4.42341C3.74957 16.2749 3.18762 16.2749 2.74155 16.215C2.2707 16.1517 1.8456 16.0124 1.504 15.6708C1.16239 15.3292 1.02314 14.9041 0.959838 14.4333C0.899864 13.9872 0.899882 13.4253 0.899903 12.7514V12.6734C0.899882 11.9996 0.899864 11.4376 0.959838 10.9915C1.02314 10.5207 1.16239 10.0956 1.504 9.754C1.8456 9.41239 2.2707 9.27314 2.74155 9.20984C3.18763 9.14986 3.74955 9.14988 4.4234 9.1499ZM2.89145 10.3248C2.54535 10.3713 2.39723 10.4518 2.29949 10.5495C2.20175 10.6472 2.12134 10.7954 2.07481 11.1414C2.0261 11.5037 2.0249 11.9894 2.0249 12.7124C2.0249 13.4354 2.0261 13.9211 2.07481 14.2834C2.12134 14.6295 2.20175 14.7776 2.29949 14.8753C2.39723 14.9731 2.54535 15.0535 2.89145 15.1C3.25373 15.1487 3.7394 15.1499 4.4624 15.1499C5.18541 15.1499 14.6711 15.1487 15.0334 15.1C15.3795 15.0535 15.5276 14.9731 15.6253 14.8753C15.7231 14.7776 15.8035 14.6295 15.85 14.2834C15.8987 13.9211 15.8999 13.4354 15.8999 12.7124C15.8999 11.9894 15.8987 11.5037 15.85 11.1414C15.8035 10.7954 15.7231 10.6472 15.6253 10.5495C15.5276 10.4518 15.3795 10.3713 15.0334 10.3248C14.6711 10.2761 5.18541 10.2749 4.4624 10.2749C3.7394 10.2749 3.25373 10.2761 2.89145 10.3248Z"
                          fill=""
                          fillRule="evenodd"
                        />
                      </svg>
                    </button>
                    </div>
                  </div>
                </div>
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="-mt-2.5 mb-6 flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <button
                      className="inline-flex items-center gap-2 border border-content-primary bg-white px-3 py-1.5 font-bold text-[12px] text-content-primary uppercase tracking-[0.06em] duration-200 ease-out hover:bg-surface-muted"
                      key={chip.key}
                      onClick={chip.onRemove}
                      type="button"
                    >
                      {chip.label}
                      <span className="text-[11px] leading-none">✕</span>
                    </button>
                  ))}
                  <button
                    className="inline-flex items-center gap-2 border border-border-subtle bg-white px-3 py-1.5 font-bold text-[11px] text-content-muted uppercase tracking-[0.06em] duration-200 ease-out hover:border-content-primary hover:text-content-primary"
                    onClick={clearFilters}
                    type="button"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}

              <div
                className={`${
                  productStyle === "grid"
                    ? "grid grid-cols-2 gap-x-5 gap-y-11 sm:gap-x-7.5 lg:grid-cols-3 2xl:grid-cols-4"
                    : "flex flex-col gap-7.5"
                }`}
              >
                {totalCount === 0 ? (
                  <p className="py-8 text-content-muted">
                    No products match your filters.
                  </p>
                ) : (
                  visibleProducts.map((item, index) =>
                    productStyle === "grid" ? (
                      <SingleGridItem
                        item={item}
                        key={item.productId ?? item.id}
                        listId={listId}
                        listName={listName}
                        position={index + 1}
                        regionId={regionId}
                        tagsPointerEventsNone
                      />
                    ) : (
                      <SingleListItem
                        item={item}
                        key={item.productId ?? item.id}
                        listId={listId}
                        listName={listName}
                        position={index + 1}
                        regionId={regionId}
                      />
                    )
                  )
                )}
              </div>
              {/* <!-- Products Grid Tab Content End --> */}
              {hasMore ? (
                <div
                  aria-hidden={!isLoadingMore}
                  className="mt-15 flex justify-center py-4 text-content-muted"
                  ref={loadMoreRef}
                >
                  {isLoadingMore ? "Loading…" : null}
                </div>
              ) : null}
              <CatalogPagination
                catalogPath={catalogPath}
                currentPage={currentPage}
                filters={filters}
                loadedPage={loadedPage}
                priceDefaults={{
                  priceMin: defaultFilters.priceMin,
                  priceMax: defaultFilters.priceMax,
                }}
                sort={sort}
                totalPages={totalPages}
              />
            </div>
            {/* // <!-- Content End --> */}
          </div>
        </div>
        )}
        {contentBelowListing}
      </section>
    </PageLayout>
  );
};

export default ShopWithSidebar;
