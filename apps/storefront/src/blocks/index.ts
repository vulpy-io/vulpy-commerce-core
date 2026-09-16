import type { Block } from "payload";
import { blocks, descriptions, f, options } from "@/i18n/admin-labels";

const linkFields = [
  { name: "label", type: "text", required: true, label: f.label },
  { name: "url", type: "text", required: true, label: f.url },
] as const;

export const heroBlock: Block = {
  slug: "hero",
  labels: blocks.hero,
  fields: [
    {
      name: "slides",
      type: "array",
      label: f.slides,
      fields: [
        { name: "eyebrow", type: "text", label: f.eyebrow },
        { name: "title", type: "text", required: true, label: f.title },
        { name: "discountValue", type: "text", label: f.discountValue },
        { name: "body", type: "textarea", label: f.body },
        { name: "ctaLabel", type: "text", label: f.ctaLabel },
        { name: "ctaUrl", type: "text", label: f.ctaUrl },
        { name: "image", type: "upload", relationTo: "media", label: f.image },
      ],
    },
    {
      name: "promos",
      type: "array",
      label: f.promos,
      fields: [
        { name: "title", type: "text", required: true, label: f.title },
        { name: "priceLabel", type: "text", label: f.priceLabel },
        { name: "offerText", type: "text", label: f.offerText },
        { name: "ctaLabel", type: "text", label: f.ctaLabel },
        { name: "link", type: "text", label: f.link },
        { name: "image", type: "upload", relationTo: "media", label: f.image },
      ],
    },
    {
      name: "badges",
      type: "array",
      label: f.badges,
      fields: [
        { name: "title", type: "text", required: true, label: f.title },
        { name: "description", type: "text", label: f.description },
        { name: "icon", type: "upload", relationTo: "media", label: f.icon },
      ],
    },
  ],
};

export const categoryGridBlock: Block = {
  slug: "categoryGrid",
  labels: blocks.categoryGrid,
  fields: [
    { name: "eyebrow", type: "text", label: f.eyebrow },
    { name: "title", type: "text", required: true, label: f.title },
    { name: "limit", type: "number", defaultValue: 12, label: f.limit },
    {
      name: "categoryHandles",
      type: "array",
      label: f.categoryHandles,
      fields: [{ name: "handle", type: "text", label: f.handle }],
    },
  ],
};

export const productGridBlock: Block = {
  slug: "productGrid",
  labels: blocks.productGrid,
  fields: [
    { name: "title", type: "text", required: true, label: f.title },
    { name: "eyebrow", type: "text", label: f.eyebrow },
    { name: "subtitle", type: "text", label: f.subtitle },
    { name: "ctaLabel", type: "text", label: f.ctaLabel },
    { name: "ctaUrl", type: "text", label: f.ctaUrl },
    {
      name: "variant",
      type: "select",
      label: f.variant,
      defaultValue: "new-arrivals",
      options: [
        { label: options.productGridVariant.newArrivals, value: "new-arrivals" },
        { label: options.productGridVariant.bestSellers, value: "best-sellers" },
        { label: options.productGridVariant.related, value: "related" },
      ],
    },
    { name: "limit", type: "number", defaultValue: 12, label: f.limit },
  ],
};

export const promoBannersBlock: Block = {
  slug: "promoBanners",
  labels: blocks.promoBanners,
  fields: [
    {
      name: "banners",
      type: "array",
      label: f.banners,
      fields: [
        { name: "eyebrow", type: "text", required: true, label: f.eyebrow },
        { name: "title", type: "text", required: true, label: f.title },
        { name: "subtitle", type: "text", label: f.subtitle },
        { name: "ctaLabel", type: "text", label: f.ctaLabel },
        { name: "ctaUrl", type: "text", label: f.ctaUrl },
        { name: "image", type: "upload", relationTo: "media", label: f.image },
      ],
    },
  ],
};

export const countdownPromoBlock: Block = {
  slug: "countdownPromo",
  labels: blocks.countdownPromo,
  fields: [
    { name: "eyebrow", type: "text", label: f.eyebrow },
    { name: "title", type: "text", required: true, label: f.title },
    { name: "body", type: "textarea", label: f.body },
    { name: "productName", type: "text", label: f.productName },
    { name: "deadline", type: "date", label: f.deadline },
    { name: "ctaLabel", type: "text", label: f.ctaLabel },
    { name: "ctaUrl", type: "text", label: f.ctaUrl },
    { name: "image", type: "upload", relationTo: "media", label: f.image },
  ],
};

export const testimonialsBlock: Block = {
  slug: "testimonials",
  labels: blocks.testimonials,
  fields: [
    { name: "eyebrow", type: "text", label: f.eyebrow },
    { name: "title", type: "text", required: true, label: f.title },
    {
      name: "items",
      type: "array",
      label: f.items,
      fields: [
        { name: "quote", type: "textarea", required: true, label: f.quote },
        { name: "authorName", type: "text", required: true, label: f.authorName },
        { name: "authorRole", type: "text", label: f.authorRole },
        { name: "avatar", type: "upload", relationTo: "media", label: f.avatar },
      ],
    },
  ],
};

export const newsletterBlock: Block = {
  slug: "newsletter",
  labels: blocks.newsletter,
  fields: [
    { name: "title", type: "text", required: true, label: f.title },
    { name: "subtitle", type: "text", label: f.subtitle },
    { name: "placeholder", type: "text", label: f.placeholder },
    { name: "bgImage", type: "upload", relationTo: "media", label: f.bgImage },
  ],
};

export const richTextBlock: Block = {
  slug: "richText",
  labels: blocks.richText,
  fields: [{ name: "content", type: "richText", required: true, label: f.content }],
};

export const contactInfoBlock: Block = {
  slug: "contactInfo",
  labels: blocks.contactInfo,
  fields: [
    { name: "contactName", type: "text", label: f.contactName },
    { name: "contactPhone", type: "text", label: f.contactPhone },
    { name: "contactEmail", type: "text", label: f.contactEmail },
    { name: "contactAddress", type: "textarea", label: f.contactAddress },
  ],
};

export const contactFormBlock: Block = {
  slug: "contactForm",
  labels: blocks.contactForm,
  fields: [
    { name: "title", type: "text", defaultValue: "Contact us", label: f.title },
    { name: "subtitle", type: "textarea", label: f.subtitle },
  ],
};

export const ctaBlock: Block = {
  slug: "cta",
  labels: blocks.cta,
  fields: [
    { name: "title", type: "text", required: true, label: f.title },
    { name: "body", type: "textarea", label: f.body },
    {
      name: "theme",
      type: "select",
      label: f.theme,
      defaultValue: "blue",
      options: [
        { label: options.ctaTheme.blue, value: "blue" },
        { label: options.ctaTheme.teal, value: "teal" },
        { label: options.ctaTheme.dark, value: "dark" },
      ],
    },
    { name: "image", type: "upload", relationTo: "media", label: f.image },
    { name: "links", type: "array", label: f.links, fields: [...linkFields] },
  ],
};

export const bannerBlock: Block = {
  slug: "banner",
  labels: blocks.banner,
  fields: [
    { name: "eyebrow", type: "text", label: f.eyebrow },
    { name: "title", type: "text", required: true, label: f.title },
    { name: "body", type: "textarea", label: f.body },
    { name: "ctaLabel", type: "text", label: f.ctaLabel },
    { name: "ctaUrl", type: "text", label: f.ctaUrl },
    { name: "image", type: "upload", relationTo: "media", label: f.image },
  ],
};

export const faqBlock: Block = {
  slug: "faq",
  labels: blocks.faq,
  fields: [
    { name: "title", type: "text", label: f.title },
    {
      name: "items",
      type: "array",
      label: f.items,
      fields: [
        { name: "question", type: "text", required: true, label: f.question },
        { name: "answer", type: "textarea", required: true, label: f.answer },
      ],
    },
  ],
};

export const mediaBlock: Block = {
  slug: "media",
  labels: blocks.media,
  fields: [
    { name: "caption", type: "text", label: f.caption },
    { name: "image", type: "upload", relationTo: "media", required: true, label: f.image },
  ],
};

export const mediaWithTextBlock: Block = {
  slug: "mediaWithText",
  labels: blocks.mediaWithText,
  fields: [
    { name: "title", type: "text", required: true, label: f.title },
    { name: "content", type: "richText", label: f.content },
    { name: "ctaLabel", type: "text", label: f.ctaLabel },
    { name: "ctaUrl", type: "text", label: f.ctaUrl },
    {
      name: "mediaType",
      type: "select",
      label: f.mediaType,
      defaultValue: "image",
      required: true,
      options: [
        { label: options.mediaType.image, value: "image" },
        { label: options.mediaType.upload, value: "upload" },
        { label: options.mediaType.youtube, value: "youtube" },
        { label: options.mediaType.vimeo, value: "vimeo" },
      ],
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      label: f.image,
      admin: {
        condition: (_, siblingData) => siblingData?.mediaType === "image",
      },
    },
    {
      name: "video",
      type: "upload",
      relationTo: "media",
      label: f.video,
      admin: {
        condition: (_, siblingData) => siblingData?.mediaType === "upload",
      },
    },
    {
      name: "videoUrl",
      type: "text",
      label: f.videoUrl,
      admin: {
        condition: (_, siblingData) =>
          siblingData?.mediaType === "youtube" || siblingData?.mediaType === "vimeo",
        description: descriptions.videoUrl,
      },
    },
    {
      name: "autoplay",
      type: "checkbox",
      label: f.autoplay,
      defaultValue: false,
      admin: {
        condition: (_, siblingData) => siblingData?.mediaType !== "image",
      },
    },
    {
      name: "mediaPosition",
      type: "select",
      label: f.mediaPosition,
      defaultValue: "left",
      options: [
        { label: options.mediaPosition.left, value: "left" },
        { label: options.mediaPosition.right, value: "right" },
      ],
    },
    {
      name: "swapOnMobile",
      type: "checkbox",
      label: f.swapOnMobile,
      defaultValue: false,
    },
  ],
};

export const spacerBlock: Block = {
  slug: "spacer",
  labels: blocks.spacer,
  fields: [{ name: "size", type: "number", defaultValue: 48, label: f.size }],
};

export const allPageBlocks: Block[] = [
  heroBlock,
  categoryGridBlock,
  productGridBlock,
  promoBannersBlock,
  countdownPromoBlock,
  testimonialsBlock,
  newsletterBlock,
  richTextBlock,
  contactInfoBlock,
  contactFormBlock,
  ctaBlock,
  bannerBlock,
  mediaWithTextBlock,
  spacerBlock,
];

export const productPageBlocks: Block[] = [
  richTextBlock,
  testimonialsBlock,
  faqBlock,
  ctaBlock,
  mediaBlock,
  mediaWithTextBlock,
  spacerBlock,
];

/** Blocks that can appear above the site footer on every page. */
export const preFooterBlocks: Block[] = [
  newsletterBlock,
  ctaBlock,
  richTextBlock,
  spacerBlock,
];
