import type { CollectionConfig } from "payload";
import { adminOnly, publicRead } from "@/access";
import { productPageBlocksField } from "@/fields/blocksField";
import { seoFields } from "@/fields/seoFields";
import { revalidateProductContent } from "@/hooks/revalidateCollection";
import { collections, descriptions, f, options } from "@/i18n/admin-labels";

const TRAILING_SLASH = /\/$/;

function medusaAdminBaseUrl() {
  return (
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  ).replace(TRAILING_SLASH, "");
}

export const ProductContent: CollectionConfig = {
  slug: "productContent",
  labels: collections.productContent,
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "handle", "medusaProductId", "updatedAt"],
    preview: (doc) => {
      const handle = typeof doc?.handle === "string" ? doc.handle : "";
      const path = `/products/${handle}`;
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
      const secret = process.env.PREVIEW_SECRET || "";
      return `${serverUrl}/api/preview?collection=productContent&slug=${handle}&path=${encodeURIComponent(path)}&secret=${secret}`;
    },
  },
  versions: { drafts: true },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    afterChange: [revalidateProductContent],
  },
  fields: [
    {
      name: "medusaProductId",
      type: "text",
      label: f.medusaProductId,
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "handle",
      type: "text",
      label: f.handle,
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "title",
      type: "text",
      label: f.title,
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "storefrontUrl",
      type: "text",
      label: f.storefrontUrl,
      virtual: true,
      admin: {
        readOnly: true,
        description: descriptions.storefrontUrl,
      },
      hooks: {
        afterRead: [
          ({ siblingData }) => {
            const handle =
              typeof siblingData?.handle === "string" ? siblingData.handle : "";
            if (!handle) {
              return "";
            }
            const base = (
              process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"
            ).replace(TRAILING_SLASH, "");
            return `${base}/products/${handle}`;
          },
        ],
      },
    },
    {
      name: "medusaAdminUrl",
      type: "text",
      label: f.medusaAdmin,
      virtual: true,
      admin: {
        readOnly: true,
        description: descriptions.medusaAdminUrl,
      },
      hooks: {
        afterRead: [
          ({ siblingData }) => {
            const id = siblingData?.medusaProductId;
            if (typeof id !== "string" || !id.trim()) {
              return "";
            }
            return `${medusaAdminBaseUrl()}/app/products/${id}`;
          },
        ],
      },
    },
    {
      name: "shortDescription",
      type: "textarea",
      label: f.shortDescription,
      admin: {
        description: descriptions.productShortDescription,
      },
    },
    {
      name: "longDescription",
      type: "textarea",
      label: f.longDescription,
      admin: {
        description: descriptions.productLongDescription,
      },
    },
    productPageBlocksField,
    {
      name: "lastSyncedAt",
      type: "date",
      label: f.lastSyncedAt,
      admin: { readOnly: true },
    },
    {
      name: "lastSyncStatus",
      type: "select",
      label: f.lastSyncStatus,
      options: [
        { label: options.syncStatus.success, value: "success" },
        { label: options.syncStatus.error, value: "error" },
      ],
      admin: { readOnly: true },
    },
    {
      name: "lastSyncSource",
      type: "text",
      label: f.lastSyncSource,
      admin: { readOnly: true },
    },
    ...seoFields,
  ],
};
