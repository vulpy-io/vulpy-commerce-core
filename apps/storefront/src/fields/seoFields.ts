import type { Field } from "payload";
import { f } from "@/i18n/admin-labels";

export const seoFields: Field[] = [
  {
    name: "seo",
    type: "group",
    label: f.seo,
    fields: [
      { name: "title", type: "text", label: f.title },
      { name: "description", type: "textarea", label: f.description },
    ],
  },
];
