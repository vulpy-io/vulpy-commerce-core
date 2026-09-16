import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import ShopWithSidebar from "@/components/ShopWithSidebar";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import JsonLd from "@/components/seo/JsonLd";
import { PSEUDO_CATEGORY_SALE } from "@/lib/cms/pseudo-categories";
import { getCategoryContentByHandle, getSiteSettings } from "@/lib/cms/queries";
import {
  getPseudoCategoryHeading,
  getPseudoCategorySeo,
} from "@/lib/medusa/category-seo";
import { getSaleCatalogPage } from "@/lib/medusa/shop-catalog.server";
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
  const [categoryContent, settings, catalog] = await Promise.all([
    getCategoryContentByHandle(PSEUDO_CATEGORY_SALE.handle),
    getSiteSettings(),
    getSaleCatalogPage(params),
  ]);

  const seo = getPseudoCategorySeo(
    categoryContent,
    settings.siteName,
    PSEUDO_CATEGORY_SALE.defaultSeo
  );
  const page = catalog?.currentPage ?? 1;
  const title = listingTitleSuffix(seo.title, page);
  const path = PSEUDO_CATEGORY_SALE.route;

  return withCanonical(
    {
      title,
      description: seo.description,
      ...buildSocialMetadata({
        title,
        description: seo.description,
        url: canonicalForListing(path, page),
        siteName: settings.siteName,
      }),
    },
    canonicalForListing(path, page)
  );
}

export default async function SalePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [catalog, categoryContent, settings] = await Promise.all([
    getSaleCatalogPage(params),
    getCategoryContentByHandle(PSEUDO_CATEGORY_SALE.handle),
    getSiteSettings(),
  ]);

  if (!catalog) {
    notFound();
  }

  enforceCatalogPagination(catalog, PSEUDO_CATEGORY_SALE.route, params);

  const pageTitle = getPseudoCategoryHeading(
    categoryContent,
    PSEUDO_CATEGORY_SALE.title
  );
  const isFirstPage = catalog.currentPage === 1;
  const path = PSEUDO_CATEGORY_SALE.route;

  return (
    <>
      <BreadcrumbJsonLd
        currentPath={path}
        items={[{ label: pageTitle, href: path }]}
      />
      <JsonLd
        data={buildCollectionPageJsonLd({
          name: pageTitle,
          path,
          page: catalog.currentPage,
          items: catalog.products.slice(0, 20).map((product) => ({
            name: product.title,
            path: product.handle ? `/products/${product.handle}` : path,
          })),
        })}
      />
      <ShopWithSidebar
        catalogPath={path}
        catalogScope="sale"
        contentAboveSubcategories={
          isFirstPage && categoryContent?.blocksAboveSubcategories.length ? (
            <PreviewableBlocksRenderer
              blocks={categoryContent.blocksAboveSubcategories}
              blocksField="blocksAboveSubcategories"
              context="sale-above-subcategories"
              livePreviewData={categoryContent.livePreviewData}
              regionId={catalog.regionId}
            />
          ) : null
        }
        contentBelowListing={
          isFirstPage && categoryContent?.blocksBelowListing.length ? (
            <PreviewableBlocksRenderer
              blocks={categoryContent.blocksBelowListing}
              blocksField="blocksBelowListing"
              context="sale-below-listing"
              livePreviewData={categoryContent.livePreviewData}
              regionId={catalog.regionId}
            />
          ) : null
        }
        contentBelowSubcategories={
          isFirstPage && categoryContent?.blocksBelowSubcategories.length ? (
            <PreviewableBlocksRenderer
              blocks={categoryContent.blocksBelowSubcategories}
              blocksField="blocksBelowSubcategories"
              context="sale-below-listing"
              livePreviewData={categoryContent.livePreviewData}
              regionId={catalog.regionId}
            />
          ) : null
        }
        currentPage={catalog.currentPage}
        facets={catalog.facets}
        filters={catalog.filters}
        hideProductListing={categoryContent?.hideProductListing}
        hideSubcategoryThumbs={categoryContent?.hideSubcategoryThumbs}
        pageSize={catalog.pageSize}
        pageTitle={
          catalog.currentPage > 1
            ? listingTitleSuffix(pageTitle, catalog.currentPage)
            : pageTitle
        }
        products={catalog.products}
        regionId={catalog.regionId}
        shopLabels={settings.shopLabels}
        showCategoryFilter={
          categoryContent?.showCategoryFilter ??
          PSEUDO_CATEGORY_SALE.showCategoryFilter
        }
        sort={catalog.sort}
        totalCount={catalog.totalCount}
        totalPages={catalog.totalPages}
      />
    </>
  );
}
