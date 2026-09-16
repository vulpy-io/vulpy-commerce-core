import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import ShopWithSidebar from "@/components/ShopWithSidebar";
import { getCategoryContentByHandle, getSiteSettings } from "@/lib/cms/queries";
import { getPseudoCategoryHeading, getPseudoCategorySeo } from "@/lib/medusa/category-seo";
import { getSelectionCatalogPage } from "@/lib/medusa/shop-catalog.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const [categoryContent, settings] = await Promise.all([
    getCategoryContentByHandle(handle),
    getSiteSettings(),
  ]);

  if (categoryContent?.kind !== "selection") {
    return { title: settings.siteName };
  }

  const seo = getPseudoCategorySeo(categoryContent, settings.siteName, {
    title: categoryContent.title,
    description: categoryContent.seo.description || categoryContent.title,
  });

  return {
    title: seo.title,
    description: seo.description,
  };
}

export default async function SelectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ handle }, resolvedSearchParams, settings] = await Promise.all([
    params,
    searchParams,
    getSiteSettings(),
  ]);

  const [catalog, categoryContent] = await Promise.all([
    getSelectionCatalogPage(handle, resolvedSearchParams),
    getCategoryContentByHandle(handle),
  ]);

  if (!(catalog && categoryContent ) || categoryContent.kind !== "selection") {
    notFound();
  }

  const pageTitle = getPseudoCategoryHeading(categoryContent, categoryContent.title);
  const catalogPath = categoryContent.route || `/selection/${handle}`;

  return (
    <ShopWithSidebar
      catalogPath={catalogPath}
      catalogScope="selection"
      contentAboveSubcategories={
        categoryContent.blocksAboveSubcategories.length ? (
          <PreviewableBlocksRenderer
            blocks={categoryContent.blocksAboveSubcategories}
            blocksField="blocksAboveSubcategories"
            context={`${handle}-above-subcategories`}
            livePreviewData={categoryContent.livePreviewData}
            regionId={catalog.regionId}
          />
        ) : null
      }
      contentBelowListing={
        categoryContent.blocksBelowListing.length ? (
          <PreviewableBlocksRenderer
            blocks={categoryContent.blocksBelowListing}
            blocksField="blocksBelowListing"
            context={`${handle}-below-listing`}
            livePreviewData={categoryContent.livePreviewData}
            regionId={catalog.regionId}
          />
        ) : null
      }
      contentBelowSubcategories={
        categoryContent.blocksBelowSubcategories.length ? (
          <PreviewableBlocksRenderer
            blocks={categoryContent.blocksBelowSubcategories}
            blocksField="blocksBelowSubcategories"
            context={`${handle}-below-subcategories`}
            livePreviewData={categoryContent.livePreviewData}
            regionId={catalog.regionId}
          />
        ) : null
      }
      currentPage={catalog.currentPage}
      facets={catalog.facets}
      filters={catalog.filters}
      hideProductListing={categoryContent.hideProductListing}
      hideSubcategoryThumbs={categoryContent.hideSubcategoryThumbs}
      pageSize={catalog.pageSize}
      pageTitle={pageTitle}
      products={catalog.products}
      regionId={catalog.regionId}
      selectionHandle={handle}
      shopLabels={settings.shopLabels}
      showCategoryFilter={categoryContent.showCategoryFilter}
      sort={catalog.sort}
      totalCount={catalog.totalCount}
      totalPages={catalog.totalPages}
    />
  );
}
