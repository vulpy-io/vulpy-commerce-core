import { randomUUID } from "node:crypto";
import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { adminOnly, publicRead } from "@/access";
import {
  categoryBlocksAboveSubcategoriesField,
  categoryBlocksBelowListingField,
  categoryBlocksBelowSubcategoriesField,
} from "@/fields/blocksField";
import { seoFields } from "@/fields/seoFields";
import { revalidateCategoryContent } from "@/hooks/revalidateCollection";
import { collections, descriptions, f, options } from "@/i18n/admin-labels";
import {
  getCategoryContentPath,
  handleFromSelectionRoute,
  isSyntheticCategoryId,
  normalizeSelectionRoute,
} from "@/lib/cms/pseudo-categories";

const TRAILING_SLASH = /\/$/;

function categoryPreviewUrl(doc: Record<string, unknown> | undefined): string {
  const handle = typeof doc?.handle === "string" ? doc.handle : "";
  const kind = typeof doc?.kind === "string" ? doc.kind : "medusa";
  const route = typeof doc?.route === "string" ? doc.route : undefined;
  const path = getCategoryContentPath(handle, kind, route);
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
  const secret = process.env.PREVIEW_SECRET || "";
  return `${serverUrl}/api/preview?collection=categoryContent&slug=${handle}&path=${encodeURIComponent(path)}&secret=${secret}`;
}

function medusaAdminBaseUrl() {
  return (
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  ).replace(TRAILING_SLASH, "");
}

const ensureSelectionIdentity: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (data?.kind !== "selection") {
    return data;
  }

  if (operation === "create" && !data.medusaCategoryId) {
    data.medusaCategoryId = `selection:${randomUUID()}`;
  }

  if (typeof data.route === "string") {
    data.route = normalizeSelectionRoute(data.route);
  }

  if (!data.handle && typeof data.route === "string" && data.route) {
    data.handle = handleFromSelectionRoute(data.route);
  }

  return data;
};

const lockSyncedIdentity: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (operation !== "update" || !originalDoc) {
    return data;
  }

  if (originalDoc.kind === "medusa" || originalDoc.kind === "pseudo") {
    data.kind = originalDoc.kind;
    data.medusaCategoryId = originalDoc.medusaCategoryId;
    data.handle = originalDoc.handle;
    data.title = originalDoc.title;
    data.route = originalDoc.route;
  }

  return data;
};

export const CategoryContent: CollectionConfig = {
  slug: "categoryContent",
  labels: collections.categoryContent,
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "handle", "kind", "route", "updatedAt"],
    preview: (doc) => categoryPreviewUrl(doc as Record<string, unknown>),
  },
  versions: { drafts: true },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [ensureSelectionIdentity, lockSyncedIdentity],
    afterChange: [revalidateCategoryContent],
  },
  fields: [
    {
      name: "kind",
      type: "select",
      label: f.kind,
      defaultValue: "medusa",
      options: [
        { label: options.categoryKind.medusa, value: "medusa" },
        { label: options.categoryKind.pseudo, value: "pseudo" },
        { label: options.categoryKind.selection, value: "selection" },
      ],
      admin: {
        description: descriptions.categoryKind,
      },
    },
    {
      name: "medusaCategoryId",
      type: "text",
      label: f.medusaCategoryId,
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        condition: (data) => data?.kind !== "selection",
      },
    },
    {
      name: "handle",
      type: "text",
      label: f.handle,
      required: true,
      unique: true,
      index: true,
      admin: {},
    },
    {
      name: "route",
      type: "text",
      label: f.route,
      admin: {
        condition: (data) => data?.kind === "pseudo" || data?.kind === "selection",
        description: descriptions.categoryRoute,
      },
    },
    {
      name: "filterQuery",
      type: "text",
      label: f.filterQuery,
      admin: {
        condition: (data) => data?.kind === "selection",
        description: descriptions.categoryFilterQuery,
      },
    },
    {
      name: "title",
      type: "text",
      label: f.title,
      required: true,
      admin: {},
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
            const kind =
              typeof siblingData?.kind === "string" ? siblingData.kind : "medusa";
            const route =
              typeof siblingData?.route === "string" ? siblingData.route : undefined;
            if (!handle) {
              return "";
            }
            const base = (
              process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000"
            ).replace(TRAILING_SLASH, "");
            const path = getCategoryContentPath(handle, kind, route);
            return `${base}${path}`;
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
        condition: (data) =>
          data?.kind === "medusa" &&
          typeof data?.medusaCategoryId === "string" &&
          !isSyntheticCategoryId(data.medusaCategoryId),
      },
      hooks: {
        afterRead: [
          ({ siblingData }) => {
            const id = siblingData?.medusaCategoryId;
            if (typeof id !== "string" || isSyntheticCategoryId(id)) {
              return "";
            }
            return `${medusaAdminBaseUrl()}/app/categories/${id}`;
          },
        ],
      },
    },
    {
      name: "h1",
      type: "text",
      label: f.h1,
      admin: {
        description: descriptions.categoryH1,
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "hideSubcategoryThumbs",
          type: "checkbox",
          label: f.hideSubcategoryThumbs,
          defaultValue: false,
        },
        {
          name: "hideProductListing",
          type: "checkbox",
          label: f.hideProductListing,
          defaultValue: false,
        },
        {
          name: "showCategoryFilter",
          type: "checkbox",
          label: f.showCategoryFilter,
          defaultValue: false,
          admin: {
            description: descriptions.categoryFilter,
          },
        },
      ],
    },
    categoryBlocksAboveSubcategoriesField,
    categoryBlocksBelowSubcategoriesField,
    categoryBlocksBelowListingField,
    {
      name: "lastSyncedAt",
      type: "date",
      label: f.lastSyncedAt,
      admin: {
        readOnly: true,
        condition: (data) => data?.kind === "medusa",
      },
    },
    {
      name: "lastSyncStatus",
      type: "select",
      label: f.lastSyncStatus,
      options: [
        { label: options.syncStatus.success, value: "success" },
        { label: options.syncStatus.error, value: "error" },
      ],
      admin: {
        readOnly: true,
        condition: (data) => data?.kind === "medusa",
      },
    },
    {
      name: "lastSyncSource",
      type: "text",
      label: f.lastSyncSource,
      admin: {
        readOnly: true,
        condition: (data) => data?.kind === "medusa",
      },
    },
    ...seoFields,
  ],
};
