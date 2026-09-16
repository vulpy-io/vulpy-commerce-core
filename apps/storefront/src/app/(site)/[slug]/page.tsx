import { notFound } from "next/navigation";
import PageLayout from "@/components/Common/PageLayout";
import PreviewableBlocksRenderer from "@/components/cms/PreviewableBlocksRenderer";
import { generateCmsPageMetadata } from "@/lib/cms/metadata";
import { getPageBySlug } from "@/lib/cms/queries";

const reservedSlugs = new Set([
  "admin",
  "api",
  "blog",
  "cart",
  "checkout",
  "contact",
  "error",
  "faq",
  "mail-success",
  "my-account",
  "order",
  "privacy-policy",
  "products",
  "shop",
  "signin",
  "signup",
  "terms",
  "wishlist",
]);

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return generateCmsPageMetadata(slug);
}

export default async function DynamicCmsPage({ params }: PageProps) {
  const { slug } = await params;
  if (reservedSlugs.has(slug)) {
    notFound();
  }

  const page = await getPageBySlug(slug);
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
        context={slug}
        livePreviewData={page.livePreviewData}
      />
    </PageLayout>
  );
}
