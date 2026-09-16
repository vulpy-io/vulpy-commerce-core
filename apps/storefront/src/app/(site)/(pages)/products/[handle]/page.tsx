import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductViewTracker from "@/components/Analytics/ProductViewTracker";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import ProductDetails from "@/components/ShopDetails/ProductDetails";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import JsonLd from "@/components/seo/JsonLd";
import config from "@/config";
import { getProductContentByHandle, getSiteSettings } from "@/lib/cms/queries";
import { getRelatedProducts } from "@/lib/data";
import {
  buildProductBreadcrumbTrail,
  getCategoryByHandle,
  getDeepestProductCategory,
  listCategoryTree,
} from "@/lib/medusa/categories";
import { mapMedusaProductToDetail } from "@/lib/medusa/mappers";
import { getProductSeo } from "@/lib/medusa/product-seo";
import { getProductByHandle } from "@/lib/medusa/products";
import { getRegion } from "@/lib/medusa/regions";
import { buildSocialMetadata, withCanonical } from "@/lib/seo/metadata";
import { buildProductJsonLd } from "@/lib/seo/product-jsonld";
import { enrichBreadcrumbStructuredLabels } from "@/lib/seo/structured-breadcrumb.server";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<{ variant?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const region = await getRegion(config.defaultCountryCode);
  const settings = await getSiteSettings();
  if (!region) {
    return { title: getProductSeo(null, null, settings.siteName).title };
  }
  const [medusaProduct, productContent] = await Promise.all([
    getProductByHandle(handle, region.id),
    getProductContentByHandle(handle),
  ]);
  const seo = getProductSeo(medusaProduct, productContent, settings.siteName);
  const path = `/products/${handle}`;
  const image =
    medusaProduct?.thumbnail ||
    medusaProduct?.images?.[0]?.url ||
    undefined;
  return withCanonical(
    {
      title: seo.title,
      description: seo.description,
      ...buildSocialMetadata({
        title: seo.title,
        description: seo.description,
        url: path,
        siteName: settings.siteName,
        images: image ? [image] : undefined,
        type: "website",
      }),
    },
    path
  );
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const query = await searchParams;
  const variantParam = query?.variant;
  const initialVariantId = Array.isArray(variantParam) ? variantParam[0] : variantParam;
  const region = await getRegion(config.defaultCountryCode);

  if (!region) {
    notFound();
  }

  const [medusaProduct, productContent, categoryTree, siteSettings] = await Promise.all([
    getProductByHandle(handle, region.id),
    getProductContentByHandle(handle),
    listCategoryTree(),
    getSiteSettings(),
  ]);

  if (!medusaProduct) {
    notFound();
  }

  const product = mapMedusaProductToDetail(medusaProduct, region.currency_code);

  if (!product) {
    notFound();
  }

  const deepestCategory = getDeepestProductCategory(
    medusaProduct.categories ?? [],
    categoryTree
  );
  const relatedProducts = await getRelatedProducts({
    sourceMetadata: (medusaProduct.metadata ?? null) as Record<string, unknown> | null,
    categoryId: deepestCategory?.id,
    excludeHandle: handle,
    regionId: region.id,
    limit: 8,
  });
  const categoryWithAncestors = deepestCategory?.handle
    ? await getCategoryByHandle(deepestCategory.handle)
    : null;
  const breadcrumbItems = buildProductBreadcrumbTrail(
    medusaProduct.categories ?? [],
    categoryTree,
    product.title,
    categoryWithAncestors
  );
  const structuredBreadcrumbItems =
    await enrichBreadcrumbStructuredLabels(breadcrumbItems);

  const breadcrumbCurrentPath = `/products/${handle}`;

  return (
    <>
      <ProductViewTracker
        brand={
          product.attributes?.find(
            (attr) => attr.label.toLowerCase() === "brand"
          )?.value
        }
        category={deepestCategory?.name}
        price={
          product.variants[0]?.discountedPrice || product.variants[0]?.price
        }
        productName={product.title}
        productSku={product.variants[0]?.id || product.productId}
      />
      <JsonLd
        data={buildProductJsonLd(product, breadcrumbCurrentPath, {
          currencyCode: region.currency_code,
          merchantListing: siteSettings.merchantListing,
        })}
      />
      <BreadcrumbJsonLd
        currentPath={breadcrumbCurrentPath}
        items={structuredBreadcrumbItems}
      />
      <ProductDetails
        breadcrumbCurrentPath={breadcrumbCurrentPath}
        breadcrumbItems={breadcrumbItems}
        includeBreadcrumbJsonLd={false}
        initialVariantId={initialVariantId}
        longDescriptionOverride={productContent?.longDescription}
        paymentMethods={siteSettings.paymentMethods}
        product={product}
        regionId={region.id}
        relatedProducts={relatedProducts}
        shortDescriptionOverride={productContent?.shortDescription}
      >
      {productContent?.blocks?.length ? (
        <PreviewableBlocksRenderer
          blocks={productContent.blocks}
          context="product"
          livePreviewData={productContent.livePreviewData}
          products={relatedProducts}
          regionId={region.id}
        />
      ) : null}
    </ProductDetails>
    </>
  );
}
