import { revalidatePath, revalidateTag } from "next/cache";
import type { CollectionAfterChangeHook } from "payload";
import { getCategoryContentPath } from "@/lib/cms/pseudo-categories";

export const revalidateBlogPosts: CollectionAfterChangeHook = ({ doc }) => {
  revalidatePath("/blog");
  if (doc?.slug) {
    revalidatePath(`/blog/${doc.slug}`);
  }
};

export const revalidatePages: CollectionAfterChangeHook = ({ doc }) => {
  if (!doc?.slug) { return; }
  const slugMap: Record<string, string> = {
    home: "/",
    contact: "/contact",
    "404": "/error",
    "mail-success": "/mail-success",
    "privacy-policy": "/privacy-policy",
    terms: "/terms",
    faq: "/faq",
  };
  const slug = doc.slug as string;
  const path = slugMap[slug] || `/${slug}`;
  if (path) { revalidatePath(path); }
};

export const revalidateHomeCollections: CollectionAfterChangeHook = () => {
  revalidatePath("/");
};

export const revalidateProductContent: CollectionAfterChangeHook = ({ doc }) => {
  const handle = doc?.handle as string | undefined;
  if (!handle) {
    return;
  }
  revalidatePath(`/products/${handle}`);
};

export const revalidateCategoryContent: CollectionAfterChangeHook = ({ doc }) => {
  const handle = doc?.handle as string | undefined;
  if (!handle) {
    return;
  }
  const kind = doc?.kind as string | undefined;
  const route = doc?.route as string | undefined;
  revalidatePath(getCategoryContentPath(handle, kind, route));
  if (kind === "selection") {
    revalidateTag("selection-routes", "max");
    revalidatePath(`/selection/${handle}`);
  }
};

/** Homepage and layout embed media; bust RSC cache when uploads are replaced. */
export const revalidateMedia: CollectionAfterChangeHook = () => {
  revalidatePath("/", "layout");
};
