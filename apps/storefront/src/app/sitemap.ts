import type { MetadataRoute } from "next";
import { getShopPageSize } from "@/lib/medusa/shop-config";
import { isSiteNoindex } from "@/lib/seo/metadata";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/seo/site-url";
import {
  getSitemapShardIds,
  paginatedListingUrls,
} from "@/lib/seo/sitemap-shards";

export function generateSitemaps() {
  const noindex = isSiteNoindex();
  return getSitemapShardIds(noindex).map((id) => ({ id }));
}

function staticEntries(siteUrl: string): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: toAbsoluteUrl("/shop"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: toAbsoluteUrl("/sale"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: toAbsoluteUrl("/blog"),
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];
}

function paginatedListingEntries(
  url: string,
  totalPages: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority: number
): MetadataRoute.Sitemap {
  return paginatedListingUrls(url, totalPages)
    .slice(1)
    .map((entryUrl) => ({
      url: entryUrl,
      changeFrequency,
      priority,
    }));
}

function categoryEntries(
  categories: { handle?: string | null; updated_at?: string | null }[]
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const category of categories) {
    if (category.handle) {
      entries.push({
        url: toAbsoluteUrl(`/categories/${category.handle}`),
        changeFrequency: "daily",
        priority: 0.8,
        lastModified: category.updated_at
          ? new Date(category.updated_at)
          : undefined,
      });
    }
  }
  return entries;
}

function productEntries(
  products: { handle?: string | null; updatedAt?: string | null; createdAt?: string | null }[]
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const product of products) {
    if (product.handle) {
      entries.push({
        url: toAbsoluteUrl(`/products/${product.handle}`),
        changeFrequency: "daily",
        priority: 0.7,
        lastModified: product.updatedAt
          ? new Date(product.updatedAt)
          : product.createdAt
            ? new Date(product.createdAt)
            : undefined,
      });
    }
  }
  return entries;
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;

  // Shard 0: static routes (always present, smallest).
  if (id === "0") {
    return staticEntries(getSiteUrl());
  }

  // Shards 1: catalog (categories + products). Fragile backends degrade to
  // static-only rather than fail the whole sitemap.
  if (id === "1") {
    const entries: MetadataRoute.Sitemap = [];
    try {
      const { getStoreProducts } = await import("@/lib/data");
      const { listCategories } = await import("@/lib/medusa/products");
      const [products, categories] = await Promise.all([
        getStoreProducts(500).catch(() => [] as never[]),
        listCategories().catch(() => [] as never[]),
      ] as const);
      entries.push(...categoryEntries(categories));
      entries.push(...productEntries(products));

      // Deep catalog pages: derive ?page=N from the product count so crawlers
      // can reach every listing page without JS.
      const pageSize = getShopPageSize();
      const shopTotalPages =
        products.length > 0
          ? Math.min(
              Math.max(1, Math.ceil(products.length / pageSize)),
              20
            )
          : 1;
      entries.push(
        ...paginatedListingEntries(
          toAbsoluteUrl("/shop"),
          shopTotalPages,
          "daily",
          0.9
        ),
        ...paginatedListingEntries(
          toAbsoluteUrl("/sale"),
          shopTotalPages,
          "daily",
          0.8
        )
      );
    } catch {
      // Medusa unavailable at build time — keep static routes only.
    }
    return entries;
  }

  // Shard 2: CMS pages + posts. CMS failures surface fewer CMS URLs, never 500.
  const entries: MetadataRoute.Sitemap = [];
  try {
    const { getPayload } = await import("payload");
    const config = await import("@payload-config");
    const payload = await getPayload({ config: config.default });

    const pages = await payload.find({
      collection: "pages",
      limit: 200,
      depth: 0,
      where: { _status: { equals: "published" } },
    });
    for (const page of pages.docs) {
      const slug = typeof page.slug === "string" ? page.slug : "";
      if (!slug || slug === "home") {
        continue;
      }
      entries.push({
        url: toAbsoluteUrl(`/${slug}`),
        changeFrequency: "weekly",
        priority: 0.5,
        lastModified: page.updatedAt ? new Date(page.updatedAt) : undefined,
      });
    }

    const posts = await payload.find({
      collection: "posts",
      limit: 500,
      depth: 0,
      where: { _status: { equals: "published" } },
    });
    for (const post of posts.docs) {
      const slug = typeof post.slug === "string" ? post.slug : "";
      if (!slug) {
        continue;
      }
      entries.push({
        url: toAbsoluteUrl(`/blog/${slug}`),
        changeFrequency: "weekly",
        priority: 0.5,
        lastModified: post.updatedAt
          ? new Date(post.updatedAt)
          : post.publishedAt
            ? new Date(post.publishedAt as string)
            : undefined,
      });
    }
  } catch {
    // Payload unavailable — keep static routes only.
  }
  return entries;
}