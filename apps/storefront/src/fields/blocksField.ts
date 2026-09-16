import type { Field } from "payload";
import { allPageBlocks, preFooterBlocks, productPageBlocks } from "@/blocks";
import { descriptions, f } from "@/i18n/admin-labels";

export const pageBlocksField: Field = {
  name: "blocks",
  type: "blocks",
  label: f.blocks,
  blocks: allPageBlocks,
};

export const productPageBlocksField: Field = {
  name: "blocks",
  type: "blocks",
  label: f.blocks,
  blocks: productPageBlocks,
};

export const preFooterBlocksField: Field = {
  name: "preFooterBlocks",
  type: "blocks",
  label: f.preFooterBlocks,
  admin: {
    description: descriptions.preFooterBlocks,
  },
  blocks: preFooterBlocks,
};

export const categoryBlocksAboveSubcategoriesField: Field = {
  name: "blocksAboveSubcategories",
  type: "blocks",
  label: f.blocksAboveSubcategories,
  blocks: allPageBlocks,
};

export const categoryBlocksBelowSubcategoriesField: Field = {
  name: "blocksBelowSubcategories",
  type: "blocks",
  label: f.blocksBelowSubcategories,
  blocks: allPageBlocks,
};

export const categoryBlocksBelowListingField: Field = {
  name: "blocksBelowListing",
  type: "blocks",
  label: f.blocksBelowListing,
  blocks: allPageBlocks,
};
