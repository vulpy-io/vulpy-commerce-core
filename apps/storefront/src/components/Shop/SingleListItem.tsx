"use client";

import ProductItem from "@/components/Common/ProductItem";
import type { Product } from "@/types/product";

const SingleListItem = ({
  item,
  regionId,
  listId,
  listName,
  position,
}: {
  item: Product;
  regionId: string;
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
    />
  );
};

export default SingleListItem;
