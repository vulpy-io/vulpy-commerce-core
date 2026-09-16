import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

/** Move homepage newsletter block into footer preFooterBlocks (idempotent). */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const payload = await getPayload({ config });
  const footer = await payload.findGlobal({ slug: "footer", depth: 2 });
  const existingPreFooter =
    ((footer as unknown as Record<string, unknown>).preFooterBlocks as Record<string, unknown>[]) || [];

  if (existingPreFooter.some((block) => block.blockType === "newsletter")) {
    return NextResponse.json({ ok: true, message: "Newsletter already in pre-footer blocks" });
  }

  const pages = await payload.find({
    collection: "pages",
    where: { slug: { equals: "home" } },
    depth: 2,
    limit: 1,
  });
  const home = pages.docs[0];
  if (!home) {
    return NextResponse.json({ error: "Home page not found" }, { status: 404 });
  }

  const blocks = [...(((home as unknown as Record<string, unknown>).blocks as Record<string, unknown>[]) || [])];
  const newsletterIndex = blocks.findIndex((block) => block.blockType === "newsletter");

  if (newsletterIndex < 0) {
    return NextResponse.json({ error: "Newsletter block not found on home page" }, { status: 404 });
  }

  const [newsletterBlock] = blocks.splice(newsletterIndex, 1);

  await payload.updateGlobal({
    slug: "footer",
    data: {
      preFooterBlocks: [newsletterBlock],
    } as Record<string, unknown>,
  });

  await payload.update({
    collection: "pages",
    id: home.id,
    data: {
      blocks,
      _status: "published",
    } as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, message: "Newsletter moved to pre-footer blocks" });
}
