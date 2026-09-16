import type { CollectionConfig } from "payload";
import { adminOnly, publicRead } from "@/access";
import { revalidateMedia } from "@/hooks/revalidateCollection";
import { collections, f } from "@/i18n/admin-labels";

export const Media: CollectionConfig = {
  slug: "media",
  labels: collections.media,
  upload: {
    staticDir: "media",
    imageSizes: [
      {
        name: "thumbnail",
        width: 400,
        height: 300,
        position: "centre",
      },
      {
        name: "card",
        width: 768,
        height: 1024,
        position: "centre",
      },
      {
        name: "tablet",
        width: 1024,
        height: undefined,
        position: "centre",
      },
    ],
    adminThumbnail: "thumbnail",
    mimeTypes: ["image/*", "video/*"],
    pasteURL: {
      allowList: [
        { protocol: "http", hostname: "localhost", port: "3000" },
        { protocol: "http", hostname: "localhost", port: "9000" },
        {
          protocol: "https",
          hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
        },
        {
          protocol: "https",
          hostname: "medusa-server-testing.s3.amazonaws.com",
        },
        {
          protocol: "https",
          hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
        },
      ],
    },
  },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: { afterChange: [revalidateMedia] },
  fields: [
    {
      name: "alt",
      type: "text",
      label: f.alt,
    },
  ],
};
