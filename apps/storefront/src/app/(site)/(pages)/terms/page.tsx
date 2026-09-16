import { notFound } from "next/navigation";
import PageLayout from "@/components/Common/PageLayout";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import { generateCmsPageMetadata } from "@/lib/cms/metadata";
import { getPageBySlug } from "@/lib/cms/queries";

export function generateMetadata() {
  return generateCmsPageMetadata("terms");
}

export default async function TermsPage() {
  const page = await getPageBySlug("terms");
  if (!page) { notFound(); }
  const blocks =
    page.blocks && page.blocks.length > 0
      ? page.blocks
      : [{ blockType: "richText", content: page.content } as const];
  return (
    <PageLayout title={page.title}>
      <PreviewableBlocksRenderer
        blocks={blocks}
        context="terms"
        livePreviewData={page.livePreviewData}
      />
    </PageLayout>
  );
}
