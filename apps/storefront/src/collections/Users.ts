import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { collections } from "@/i18n/admin-labels";

export const Users: CollectionConfig = {
  slug: "users",
  labels: collections.users,
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: "email",
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [],
};
