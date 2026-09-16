import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryRegister from "@/components/CategoryRegister";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import ShopWithSidebar from "@/components/ShopWithSidebar";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import JsonLd from "@/components/seo/JsonLd";
import { getCategoryContentByHandle, getSiteSettings } from "@/lib/cms/queries";
import { buildCategoryBreadcrumb, getCategoryByHandle } from "@/lib/medusa/categories";
import { getCategoryRegisterPage } from "@/lib/medusa/category-register.server";
import { getCategoryHeading, getCategorySeo } from "@/lib/medusa/category-seo";
import { getCategoryCatalogPage } from "@/lib/medusa/shop-catalog.server";
import { hasCatalogQueryParams } from "@/lib/seo/catalog-params";
import { enforceCatalogPagination } from "@/lib/seo/catalog-routing";
import {
  buildSocialMetadata,
  canonicalForListing,
  listingTitleSuffix,
  withCanonical,
} from "@/lib/seo/metadata";
import { enrichBreadcrumbStructuredLabels } from "@/lib/seo/structured-breadcrumb.server";
import { buildCollectionPageJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { handle } = await params;
  const query = await searchParams;
  const [category, categoryContent, settings, catalog] = await Promise.all([
    getCategoryByHandle(handle),
    getCategoryContentByHandle(handle),
    getSiteSettings(),
    getCategoryCatalogPage(handle, query),
  ]);

  if (!(category && catalog)) {
    return { title: "Not found" };
  }

  const seo = getCategorySeo(category, settings.siteName, categoryContent);
  const title = listingTitleSuffix(seo.title, catalog.currentPage);
  const path = `/categories/${handle}`;
  return withCanonical(
    {
      title,
      description: seo.description,
      ...buildSocialMetadata({
        title,
        description: seo.description,
        url: canonicalForListing(path, catalog.currentPage),
        siteName: settings.siteName,
        type: "website",
      }),
    },
    canonicalForListing(path, catalog.currentPage)
  );
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const query = await searchParams;
  const [catalog, categoryContent, settings] = await Promise.all([
    getCategoryCatalogPage(handle, query),
    getCategoryContentByHandle(handle),
    getSiteSettings(),
  ]);

  if (!catalog) {
    notFound();
  }

  enforceCatalogPagination(catalog, `/categories/${handle}`, query);

  // Editorial register: top-level categories with >= 2 product-bearing
  // children render the CategoryRegister landing on clean first-page URLs
  // (no filters/sort/deep page, no CMS blocks). Everything else — leaf
  // categories, filtered/paginated views, block-managed categories — keeps
  // the standard ShopWithSidebar listing. getCategoryRegisterPage returns
  // null for missing categories or < 2 product-bearing children.
  const isFirstPage = catalog.currentPage === 1;
  const register =
    isFirstPage &&
    !hasCatalogQueryParams(query) &&
    !(categoryContent?.blocksAboveSubcategories.length ||
      categoryContent?.blocksBelowListing.length)
      ? await getCategoryRegisterPage(handle)
      : null;

  const breadcrumbItems = buildCategoryBreadcrumb(catalog.category);
  const structuredBreadcrumbItems =
    await enrichBreadcrumbStructuredLabels(breadcrumbItems);
  const breadcrumbCurrentPath = `/categories/${handle}`;
  const pageTitle = getCategoryHeading(catalog.category, categoryContent);

  return (
    <>
      <BreadcrumbJsonLd
        currentPath={breadcrumbCurrentPath}
        items={structuredBreadcrumbItems}
      />
      <JsonLd
        data={buildCollectionPageJsonLd({
          name: pageTitle,
          description: getCategorySeo(
            catalog.category,
            settings.siteName,
            categoryContent
          ).description,
          path: breadcrumbCurrentPath,
          page: catalog.currentPage,
          items: catalog.products.slice(0, 20).map((product) => ({
            name: product.title,
            path: product.handle
              ? `/products/${product.handle}`
              : breadcrumbCurrentPath,
          })),
        })}
      />
      {register ? (
        <CategoryRegister
          breadcrumbCurrentPath={breadcrumbCurrentPath}
          breadcrumbItems={breadcrumbItems}
          categoryName={catalog.category.name ?? handle}
          collections={register.children}
          deck={getCategorySeo(catalog.category, settings.siteName, categoryContent).description}
          pageTitle={pageTitle}
          regionId={catalog.regionId}
        />
      ) : (
        <ShopWithSidebar
          breadcrumbCurrentPath={breadcrumbCurrentPath}
        breadcrumbItems={breadcrumbItems}
        catalogPath={`/categories/${handle}`}
        categoryHandle={handle}
        childCategories={catalog.childCategories}
        contentAboveSubcategories={
          isFirstPage && categoryContent?.blocksAboveSubcategories.length ? (
            <PreviewableBlocksRenderer
              blocks={categoryContent.blocksAboveSubcategories}
              blocksField="blocksAboveSubcategories"
              context="category-above-subcategories"
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
              context="category-below-listing"
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
              context="category-below-subcategories"
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
        sort={catalog.sort}
        totalCount={catalog.totalCount}
        totalPages={catalog.totalPages}
      />
      )}
    </>
  );
}
