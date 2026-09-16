import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access";
import { collections, f } from "@/i18n/admin-labels";

export const ContactSubmissions: CollectionConfig = {
  slug: "contact-submissions",
  labels: collections.contactSubmissions,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["name", "email", "subject", "createdAt"],
    description: "Messages from the contact form (read-only).",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "name", type: "text", label: f.contactName, required: true },
    { name: "email", type: "email", label: f.email, required: true },
    { name: "subject", type: "text", label: f.subject },
    { name: "message", type: "textarea", label: f.content, required: true },
  ],
};
