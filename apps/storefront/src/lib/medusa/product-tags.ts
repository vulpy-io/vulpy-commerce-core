import type { HttpTypes } from "@medusajs/types";

const METADATA_SHOW_IN_STORE = "show_in_store";
const METADATA_COLOR = "color";
const DEFAULT_TAG_COLOR = "#3B82F6";
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export type ProductStoreTag = {
  id: string;
  label: string;
  color: string;
};

function parseTagColor(metadata?: Record<string, unknown> | null): string {
  const rawColor = metadata?.[METADATA_COLOR];
  if (typeof rawColor === "string" && HEX_COLOR_PATTERN.test(rawColor)) {
    return rawColor;
  }
  return DEFAULT_TAG_COLOR;
}

function isTagVisibleInStore(metadata?: Record<string, unknown> | null): boolean {
  return metadata?.[METADATA_SHOW_IN_STORE] === true;
}

export function mapVisibleStoreTags(
  tags?: HttpTypes.StoreProductTag[] | null
): ProductStoreTag[] {
  if (!tags?.length) {
    return [];
  }

  return tags
    .filter((tag) => isTagVisibleInStore(tag.metadata))
    .map((tag) => ({
      id: tag.id,
      label: tag.value,
      color: parseTagColor(tag.metadata),
    }));
}

export function getBadgeTextColor(backgroundColor: string): string {
  const hex = backgroundColor.replace("#", "");
  if (hex.length !== 6) {
    return "#ffffff";
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.6 ? "#111827" : "#ffffff";
}
