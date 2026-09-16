import { notFound } from "next/navigation";
import PageLayout from "@/components/Common/PageLayout";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import { generateCmsPageMetadata } from "@/lib/cms/metadata";
import { getPageBySlug } from "@/lib/cms/queries";

export function generateMetadata() {
  return generateCmsPageMetadata("cookie-policy");
}

export default async function CookiePolicyPage() {
  const page = await getPageBySlug("cookie-policy");
  if (!page) {
    notFound();
  }
  const blocks =
    page.blocks && page.blocks.length > 0
      ? page.blocks
      : [{ blockType: "richText", content: page.content } as const];
  return (
    <PageLayout title={page.title}>
      <PreviewableBlocksRenderer
        blocks={blocks}
        context="cookie-policy"
        livePreviewData={page.livePreviewData}
      />
    </PageLayout>
  );
}
