import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopWithSidebar from "@/components/ShopWithSidebar";
import JsonLd from "@/components/seo/JsonLd";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getSiteSettings } from "@/lib/cms/queries";
import { getShopCatalogPage } from "@/lib/medusa/shop-catalog.server";
import { enforceCatalogPagination } from "@/lib/seo/catalog-routing";
import {
  buildSocialMetadata,
  canonicalForListing,
  listingTitleSuffix,
  withCanonical,
} from "@/lib/seo/metadata";
import { buildCollectionPageJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const [settings, catalog] = await Promise.all([
    getSiteSettings(),
    getShopCatalogPage(params),
  ]);
  const base = await generateUtilityMetadata("/shop", {
    title: "Shop | Vulpy Commerce",
    description: "Browse our catalog",
  });
  const page = catalog?.currentPage ?? 1;
  const title = listingTitleSuffix(
    typeof base.title === "string" ? base.title : "Shop",
    page
  );
  return withCanonical(
    {
      ...base,
      title,
      ...buildSocialMetadata({
        title,
        description:
          typeof base.description === "string" ? base.description : undefined,
        url: canonicalForListing("/shop", page),
        siteName: settings.siteName,
      }),
    },
    canonicalForListing("/shop", page)
  );
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [catalog, settings] = await Promise.all([
    getShopCatalogPage(params),
    getSiteSettings(),
  ]);

  if (!catalog) {
    notFound();
  }

  enforceCatalogPagination(catalog, "/shop", params);

  return (
    <>
      <JsonLd
        data={buildCollectionPageJsonLd({
          name: settings.shopLabels.breadcrumb || "Shop",
          path: "/shop",
          page: catalog.currentPage,
          items: catalog.products.slice(0, 20).map((product) => ({
            name: product.title,
            path: product.handle ? `/products/${product.handle}` : "/shop",
          })),
        })}
      />
      <ShopWithSidebar
        catalogPath="/shop"
        catalogScope="shop"
        currentPage={catalog.currentPage}
        facets={catalog.facets}
        filters={catalog.filters}
        pageSize={catalog.pageSize}
        pageTitle={
          catalog.currentPage > 1
            ? listingTitleSuffix(
                settings.shopLabels.breadcrumb || "Shop",
                catalog.currentPage
              )
            : undefined
        }
        products={catalog.products}
        regionId={catalog.regionId}
        shopLabels={settings.shopLabels}
        showCategoryFilter
        sort={catalog.sort}
        totalCount={catalog.totalCount}
        totalPages={catalog.totalPages}
      />
    </>
  );
}
