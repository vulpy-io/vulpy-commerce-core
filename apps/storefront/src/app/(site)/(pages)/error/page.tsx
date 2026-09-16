import { notFound } from "next/navigation";
import PageLayout from "@/components/Common/PageLayout";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import { generateCmsPageMetadata } from "@/lib/cms/metadata";
import { getPageBySlug } from "@/lib/cms/queries";

export function generateMetadata() {
  return generateCmsPageMetadata("404");
}

export default async function ErrorPage() {
  const page = await getPageBySlug("404");
  if (!page) { notFound(); }
  const blocks =
    page.blocks && page.blocks.length > 0
      ? page.blocks
      : [{ blockType: "richText", content: page.content } as const];

  return (
    <PageLayout title={page.title}>
      <PreviewableBlocksRenderer
        blocks={blocks}
        context="404"
        livePreviewData={page.livePreviewData}
      />
    </PageLayout>
  );
}
