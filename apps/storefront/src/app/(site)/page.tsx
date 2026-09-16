import type { Metadata } from "next";
import { cmsSectionProps } from "@/components/cms/cms-section";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import JsonLd from "@/components/seo/JsonLd";
import { getPageBySlug, getSiteSettings } from "@/lib/cms/queries";
import type { CmsBlock } from "@/lib/cms/types";
import { getRegionId } from "@/lib/data";
import {
  getCategoriesByHandles,
  getOrderedTopLevelCategories,
  getProductCategoryIds,
  listCategoryTree,
} from "@/lib/medusa/categories";
import { mapStoreCategoriesToDisplay } from "@/lib/medusa/category-display";
import { getHomeProductGrids } from "@/lib/medusa/home-products";
import { formatSeoTitle } from "@/lib/seo/format-seo-title";
import {
  buildSocialMetadata,
  withCanonical,
} from "@/lib/seo/metadata";
import { buildHomeJsonLd } from "@/lib/seo/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const title = formatSeoTitle(settings.defaultSeo.title, settings.siteName);
  const description = settings.defaultSeo.description;
  return withCanonical(
    {
      title,
      description,
      ...buildSocialMetadata({
        title,
        description,
        url: "/",
        siteName: settings.siteName,
        images: settings.logoUrl ? [settings.logoUrl] : undefined,
        type: "website",
      }),
    },
    "/"
  );
}

export default async function HomePage() {
  const regionId = await getRegionId();
  const [homePage, settings] = await Promise.all([
    getPageBySlug("home"),
    getSiteSettings(),
  ]);
  const blocks = homePage?.blocks || [];

  const [homeProducts, categoryTree, productCategoryIds] = await Promise.all([
    getHomeProductGrids(blocks),
    listCategoryTree(),
    getProductCategoryIds(regionId),
  ]);

  const categoryGridBlock = blocks.find(
    (block): block is Extract<CmsBlock, { blockType: "categoryGrid" }> =>
      block.blockType === "categoryGrid"
  );
  const curatedHandles =
    categoryGridBlock?.categoryHandles
      ?.map((entry) => entry.handle)
      .filter(Boolean) ?? [];

  const categories = curatedHandles.length
    ? mapStoreCategoriesToDisplay(
        getCategoriesByHandles(categoryTree, curatedHandles)
      )
    : mapStoreCategoriesToDisplay(
        getOrderedTopLevelCategories(categoryTree, productCategoryIds)
      );

  return (
    <main {...cmsSectionProps({ type: "page", slug: "home" })}>
      <JsonLd data={buildHomeJsonLd(settings)} />
      <PreviewableBlocksRenderer
        bestsellerProducts={homeProducts.bestsellerProducts}
        blocks={blocks}
        categories={categories}
        context="home"
        livePreviewData={homePage?.livePreviewData}
        newArrivalProducts={homeProducts.newArrivalProducts}
        regionId={regionId}
      />
    </main>
  );
}
