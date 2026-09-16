import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  matchSelectionHandle,
  type SelectionRouteEntry,
} from "@/lib/cms/selection-route-match";
import { isSiteNoindex } from "@/lib/seo/site-noindex";

const STATIC_PREFIXES = [
  "/_next",
  "/api",
  "/admin",
  "/images",
  "/blog",
  "/shop",
  "/sale",
  "/cart",
  "/checkout",
  "/products",
  "/categories",
  "/selection",
  "/signin",
  "/signup",
  "/my-account",
  "/orders",
  "/search",
  "/error",
  "/mail-success",
  "/privacy-policy",
  "/terms",
  "/faq",
  "/contact",
];

function applyCrawlHeaders(response: NextResponse): NextResponse {
  if (isSiteNoindex()) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

async function getSelectionHandleForPath(
  pathname: string,
  request: NextRequest
): Promise<string | null> {
  try {
    const response = await fetch(new URL("/api/selection/routes", request.url), {
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { routes?: SelectionRouteEntry[] };
    return matchSelectionHandle(pathname, body.routes ?? []);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    STATIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return applyCrawlHeaders(NextResponse.next());
  }

  const handle = await getSelectionHandleForPath(pathname, request);
  if (!handle) {
    return applyCrawlHeaders(NextResponse.next());
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/selection/${handle}`;
  return applyCrawlHeaders(NextResponse.rewrite(rewriteUrl));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
    "/robots.txt",
    "/sitemap.xml",
  ],
};
