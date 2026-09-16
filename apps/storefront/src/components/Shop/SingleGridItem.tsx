"use client";

import ProductItem from "@/components/Common/ProductItem";
import type { Product } from "@/types/product";

const SingleGridItem = ({
  item,
  regionId,
  tagsPointerEventsNone = false,
  listId,
  listName,
  position,
}: {
  item: Product;
  regionId: string;
  tagsPointerEventsNone?: boolean;
  listId?: string;
  listName?: string;
  position?: number;
}) => {
  return (
    <ProductItem
      item={item}
      listId={listId}
      listName={listName}
      position={position}
      regionId={regionId}
      tagsPointerEventsNone={tagsPointerEventsNone}
    />
  );
};

export default SingleGridItem;
