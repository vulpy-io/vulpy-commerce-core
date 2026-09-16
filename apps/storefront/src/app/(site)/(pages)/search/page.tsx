import type { Metadata } from "next";
import SearchAnalytics from "@/components/Analytics/SearchAnalytics";
import ShopWithSidebar from "@/components/ShopWithSidebar";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getSiteSettings } from "@/lib/cms/queries";
import { getSearchCategories } from "@/lib/medusa/categories";
import { getRegionId } from "@/lib/medusa/regions";
import { mapSearchHitToShopProduct, searchProducts } from "@/lib/medusa/search";
import { sortShopProducts } from "@/lib/medusa/shop-display";
import { buildFilterFacets, filterShopProducts } from "@/lib/medusa/shop-filters";
import { parseShopSearchParams } from "@/lib/medusa/shop-query";

type SearchPageProps = {
  searchParams?: Promise<{
    category?: string | string[];
    page?: string | string[];
    q?: string | string[];
  }>;
};

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata(
    "/search",
    {
      title: "Search | Vulpy Commerce",
      description: "Search products",
    },
    { noindex: true, canonicalPath: "/search" }
  );
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = firstParam(params?.q)?.trim() ?? "";
  const category = firstParam(params?.category);

  const regionId = await getRegionId();
  if (!regionId) {
    return null;
  }

  const [searchResult, categories, settings] = await Promise.all([
    searchProducts({
      query,
      categoryId: category,
      regionId,
      limit: 500,
      offset: 0,
    }),
    getSearchCategories(regionId),
    getSiteSettings(),
  ]);

  const categoryLabel = categories.find((item) => item.value === category)?.label ?? "";
  const allProducts = searchResult.hits.map(mapSearchHitToShopProduct);
  const facets = buildFilterFacets(allProducts);
  const paramsWithoutBaseCategory =
    params && "category" in params
      ? Object.fromEntries(
          Object.entries(params).filter(([key]) => key !== "category")
        )
      : (params ?? {});
  const { sort, filters } = parseShopSearchParams(
    paramsWithoutBaseCategory,
    facets
  );
  const filteredProducts = filterShopProducts(allProducts, filters);
  const sortedProducts = sortShopProducts(filteredProducts, sort);
  const pageSize = Math.max(sortedProducts.length, 1);

  const baseSearchParams = new URLSearchParams();
  if (query) {
    baseSearchParams.set("q", query);
  }
  if (category) {
    baseSearchParams.set("category", category);
  }

  return (
    <>
      {query ? (
        <SearchAnalytics
          category={categoryLabel}
          keyword={query}
          resultCount={sortedProducts.length}
        />
      ) : null}
      <ShopWithSidebar
      catalogPath={`/search${baseSearchParams.toString() ? `?${baseSearchParams.toString()}` : ""}`}
      currentPage={1}
      facets={facets}
      filters={filters}
      pageSize={pageSize}
      pageTitle={
        categoryLabel
          ? `Search results: "${query || "all"}", category ${categoryLabel}`
          : `Search results: "${query || "all"}"`
      }
      products={sortedProducts}
      regionId={regionId}
      shopLabels={settings.shopLabels}
      showCategoryFilter
      sort={sort}
      totalCount={sortedProducts.length}
      totalPages={1}
    />
    </>
  );
}
