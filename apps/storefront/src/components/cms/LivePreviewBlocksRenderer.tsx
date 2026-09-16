"use client";

import { useLivePreview } from "@payloadcms/live-preview-react";
import BlocksRenderer from "@/components/cms/BlocksRenderer";
import { mapBlocks } from "@/lib/cms/block-mappers";
import type { CmsBlock } from "@/lib/cms/types";
import type { Category } from "@/types/category";
import type { Product } from "@/types/product";

type PreviewDocument = Record<string, unknown> & {
  blocks?: unknown;
};

export default function LivePreviewBlocksRenderer({
  initialData,
  fallbackBlocks,
  products = [],
  newArrivalProducts = [],
  bestsellerProducts = [],
  categories = [],
  regionId,
  context,
  blocksField = "blocks",
}: {
  initialData: PreviewDocument;
  fallbackBlocks: CmsBlock[];
  products?: Product[];
  newArrivalProducts?: Product[];
  bestsellerProducts?: Product[];
  categories?: Category[];
  regionId?: string;
  context?: string;
  blocksField?: string;
}) {
  const { data } = useLivePreview<PreviewDocument>({
    depth: 2,
    initialData,
    serverURL: process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000",
  });

  const liveBlocks = mapBlocks(data?.[blocksField]);

  return (
    <BlocksRenderer
      bestsellerProducts={bestsellerProducts}
      blocks={liveBlocks.length ? liveBlocks : fallbackBlocks}
      categories={categories}
      context={context}
      newArrivalProducts={newArrivalProducts}
      products={products}
      regionId={regionId}
    />
  );
}
