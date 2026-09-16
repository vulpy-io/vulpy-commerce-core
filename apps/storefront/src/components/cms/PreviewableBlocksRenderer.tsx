import { draftMode } from "next/headers";
import BlocksRenderer from "@/components/cms/BlocksRenderer";
import LivePreviewBlocksRenderer from "@/components/cms/LivePreviewBlocksRenderer";
import type { CmsBlock } from "@/lib/cms/types";
import type { Category } from "@/types/category";
import type { Product } from "@/types/product";

export default async function PreviewableBlocksRenderer({
  blocks,
  livePreviewData,
  products = [],
  newArrivalProducts = [],
  bestsellerProducts = [],
  categories = [],
  regionId,
  context,
  blocksField = "blocks",
}: {
  blocks: CmsBlock[];
  livePreviewData?: Record<string, unknown>;
  products?: Product[];
  newArrivalProducts?: Product[];
  bestsellerProducts?: Product[];
  categories?: Category[];
  regionId?: string;
  context?: string;
  blocksField?: string;
}) {
  const { isEnabled } = await draftMode();

  if (isEnabled && livePreviewData) {
    return (
      <LivePreviewBlocksRenderer
        bestsellerProducts={bestsellerProducts}
        blocksField={blocksField}
        categories={categories}
        context={context}
        fallbackBlocks={blocks}
        initialData={livePreviewData}
        newArrivalProducts={newArrivalProducts}
        products={products}
        regionId={regionId}
      />
    );
  }

  return (
    <BlocksRenderer
      bestsellerProducts={bestsellerProducts}
      blocks={blocks}
      categories={categories}
      context={context}
      newArrivalProducts={newArrivalProducts}
      products={products}
      regionId={regionId}
    />
  );
}
