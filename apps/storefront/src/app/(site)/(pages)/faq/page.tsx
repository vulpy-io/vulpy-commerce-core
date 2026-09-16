import { notFound } from "next/navigation";
import PageLayout from "@/components/Common/PageLayout";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import JsonLd from "@/components/seo/JsonLd";
import { generateCmsPageMetadata } from "@/lib/cms/metadata";
import { getPageBySlug } from "@/lib/cms/queries";
import type { CmsBlock } from "@/lib/cms/types";
import { buildFaqPageJsonLd } from "@/lib/seo/structured-data";

export function generateMetadata() {
  return generateCmsPageMetadata("faq");
}

function collectFaqItems(blocks: CmsBlock[]) {
  const items: Array<{ question: string; answer: string }> = [];
  for (const block of blocks) {
    if (block.blockType !== "faq") {
      continue;
    }
    for (const item of block.items ?? []) {
      if (item.question && item.answer) {
        items.push({ question: item.question, answer: item.answer });
      }
    }
  }
  return items;
}

export default async function FaqPage() {
  const page = await getPageBySlug("faq");
  if (!page) {
    notFound();
  }
  const blocks =
    page.blocks && page.blocks.length > 0
      ? page.blocks
      : ([{ blockType: "richText", content: page.content }] as CmsBlock[]);
  const faqJsonLd = buildFaqPageJsonLd(collectFaqItems(blocks));
  return (
    <PageLayout title={page.title}>
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}
      <PreviewableBlocksRenderer
        blocks={blocks}
        context="faq"
        livePreviewData={page.livePreviewData}
      />
    </PageLayout>
  );
}
