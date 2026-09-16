import type { MetadataRoute } from "next";
import { isSiteNoindex } from "@/lib/seo/metadata";
import { getSiteUrl } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  if (isSiteNoindex()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: ["/_next/static/", "/_next/image"],
      disallow: [
        "/cart",
        "/checkout",
        "/my-account",
        "/signin",
        "/signup",
        "/wishlist",
        "/search",
        "/*?*_rsc=",
        "/*&_rsc=",
        "/*?*sort=",
        "/*?*priceMin=",
        "/*?*priceMax=",
        "/*?*sizes=",
        "/*?*colors=",
        "/*?*categories=",
        "/*?*attr_",
        "/*?*sale_only=",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
