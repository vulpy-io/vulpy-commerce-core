import { notFound } from "next/navigation";
import PageLayout from "@/components/Common/PageLayout";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import { generateCmsPageMetadata } from "@/lib/cms/metadata";
import { getPageBySlug, getSiteSettings } from "@/lib/cms/queries";
import type { CmsBlock } from "@/lib/cms/types";

export function generateMetadata() {
  return generateCmsPageMetadata("contact");
}

export default async function ContactPage() {
  const [page, settings] = await Promise.all([
    getPageBySlug("contact"),
    getSiteSettings(),
  ]);
  if (!page) { notFound(); }

  const blocks: CmsBlock[] =
    page.blocks && page.blocks.length > 0
      ? page.blocks
      : [
          {
            blockType: "contactInfo",
            contactName: settings.contactInfo.contactName,
            contactPhone: settings.contactInfo.phone,
            contactEmail: settings.contactInfo.email,
            contactAddress: settings.contactInfo.address,
          },
          { blockType: "richText", content: page.content },
        ];

  return (
    <PageLayout title={page.title}>
      <PreviewableBlocksRenderer
        blocks={blocks}
        context="contact"
        livePreviewData={page.livePreviewData}
      />
    </PageLayout>
  );
}
