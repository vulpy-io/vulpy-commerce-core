import type { CollectionConfig } from "payload";
import { adminOnly, publicRead } from "@/access";
import { pageBlocksField } from "@/fields/blocksField";
import { seoFields } from "@/fields/seoFields";
import { revalidateBlogPosts, revalidatePages } from "@/hooks/revalidateCollection";
import { collections, f, options } from "@/i18n/admin-labels";

export const BlogCategories: CollectionConfig = {
  slug: "blog-categories",
  labels: collections.blogCategories,
  admin: { useAsTitle: "name" },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: "name", type: "text", required: true, label: f.name },
    { name: "slug", type: "text", required: true, unique: true, label: f.slug },
  ],
};

export const Tags: CollectionConfig = {
  slug: "tags",
  labels: collections.tags,
  admin: { useAsTitle: "name" },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: "name", type: "text", required: true, label: f.name },
    { name: "slug", type: "text", required: true, unique: true, label: f.slug },
  ],
};

export const Posts: CollectionConfig = {
  slug: "posts",
  labels: collections.posts,
  admin: { useAsTitle: "title", defaultColumns: ["title", "publishedAt", "updatedAt"] },
  versions: { drafts: true },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: { afterChange: [revalidateBlogPosts] },
  fields: [
    { name: "title", type: "text", required: true, label: f.title },
    { name: "slug", type: "text", required: true, unique: true, label: f.slug },
    { name: "excerpt", type: "textarea", label: f.excerpt },
    { name: "content", type: "richText", label: f.content },
    { name: "featuredImage", type: "upload", relationTo: "media", label: f.featuredImage },
    {
      name: "categories",
      type: "relationship",
      relationTo: "blog-categories",
      hasMany: true,
      label: f.categories,
    },
    { name: "tags", type: "relationship", relationTo: "tags", hasMany: true, label: f.tags },
    { name: "authorName", type: "text", label: f.authorName },
    { name: "publishedAt", type: "date", label: f.publishedAt },
    { name: "views", type: "number", defaultValue: 0, label: f.views },
    ...seoFields,
  ],
};

export const Pages: CollectionConfig = {
  slug: "pages",
  labels: collections.pages,
  admin: {
    useAsTitle: "title",
    preview: (doc) => {
      const slug = typeof doc?.slug === "string" ? doc.slug : "home";
      const path = slug === "home" ? "/" : `/${slug}`;
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
      const secret = process.env.PREVIEW_SECRET || "";
      return `${serverUrl}/api/preview?collection=pages&slug=${slug}&path=${encodeURIComponent(path)}&secret=${secret}`;
    },
  },
  versions: { drafts: { autosave: true } },
  access: {
    read: publicRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: { afterChange: [revalidatePages] },
  fields: [
    { name: "title", type: "text", required: true, label: f.title },
    { name: "slug", type: "text", required: true, unique: true, label: f.slug },
    pageBlocksField,
    {
      name: "layout",
      type: "select",
      label: f.layout,
      options: [
        { label: options.layout.contact, value: "contact" },
        { label: options.layout.generic, value: "generic" },
        { label: options.layout.error, value: "error" },
        { label: options.layout.mailSuccess, value: "mail-success" },
      ],
      defaultValue: "generic",
    },
    { name: "content", type: "richText", label: f.content },
    { name: "heroImage", type: "upload", relationTo: "media", label: f.heroImage },
    { name: "contactName", type: "text", label: f.contactName },
    { name: "contactPhone", type: "text", label: f.contactPhone },
    { name: "contactEmail", type: "text", label: f.contactEmail },
    { name: "contactAddress", type: "textarea", label: f.contactAddress },
    ...seoFields,
  ],
};
