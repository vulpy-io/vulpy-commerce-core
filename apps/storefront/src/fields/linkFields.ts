import type { Field } from "payload";
import { descriptions, f } from "@/i18n/admin-labels";

export const linkFields: Field[] = [
  { name: "label", type: "text", required: true, label: f.label },
  { name: "url", type: "text", required: true, label: f.url },
  { name: "newTab", type: "checkbox", defaultValue: false, label: f.newTab },
];

/** One CMS submenu level only — deeper trees come from Medusa category merge. */
const navSubmenuItemFields: Field[] = [
  { name: "title", type: "text", required: true, label: f.title },
  { name: "path", type: "text", required: true, label: f.path },
  { name: "newTab", type: "checkbox", defaultValue: false, label: f.newTab },
  {
    name: "mobileOnly",
    type: "checkbox",
    defaultValue: false,
    label: f.mobileOnly,
    admin: {
      description: descriptions.navMobileOnly,
    },
  },
];

export const navItemFields: Field[] = [
  { name: "title", type: "text", required: true, label: f.title },
  { name: "path", type: "text", required: true, label: f.path },
  { name: "newTab", type: "checkbox", defaultValue: false, label: f.newTab },
  {
    name: "submenu",
    type: "array",
    label: f.submenu,
    fields: navSubmenuItemFields,
  },
];
