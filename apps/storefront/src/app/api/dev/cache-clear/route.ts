import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Dev-only: clear the storefront server cache tags so a fresh backend
 * catalog/facets state is picked up without a full restart. Not available
 * in production.
 */
export function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  revalidateTag("shop-catalog", "default");
  revalidateTag("shop-facets", "default");
  return NextResponse.json({ ok: true, revalidated: ["shop-catalog", "shop-facets"] });
}