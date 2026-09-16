import type { GlobalConfig } from "payload";
import { adminOnly, publicRead } from "@/access";
import { preFooterBlocksField } from "@/fields/blocksField";
import { linkFields, navItemFields } from "@/fields/linkFields";
import {
  revalidateHomeGlobal,
  revalidateSiteGlobal,
} from "@/hooks/revalidateSite";
import { descriptions, f, globals, options } from "@/i18n/admin-labels";
import { defaultSocialLinks } from "@/lib/cms/defaults";

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: globals.siteSettings.singular,
  access: {
    read: publicRead,
    update: adminOnly,
  },
  hooks: { afterChange: [revalidateSiteGlobal] },
  fields: [
    { name: "siteName", type: "text", label: f.siteName, defaultValue: "Vulpy Commerce" },
    { name: "topBarText", type: "text", label: "Top bar tagline", admin: { placeholder: "Handcrafted pieces, delivered worldwide" } },
    {
      name: "topBarLinks",
      type: "array",
      label: "Top bar links",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "url", type: "text", required: true },
      ],
    },
    { name: "logo", type: "upload", relationTo: "media", label: f.logo },
    { name: "checkoutLogo", type: "upload", relationTo: "media", label: f.checkoutLogo },
    { name: "supportPhone", type: "text", label: f.supportPhone },
    { name: "searchPlaceholder", type: "text", label: f.searchPlaceholder, defaultValue: "Search products..." },
    {
      name: "hideCart",
      type: "checkbox",
      label: f.hideCart,
      defaultValue: true,
    },
    {
      name: "medusaCategoriesInNavigation",
      type: "select",
      label: f.medusaCategoriesInNavigation,
      defaultValue: "before",
      options: [
        { label: options.medusaCategoriesInNavigation.before, value: "before" },
        { label: options.medusaCategoriesInNavigation.after, value: "after" },
        { label: options.medusaCategoriesInNavigation.hide, value: "hide" },
      ],
    },
    {
      name: "contactInfo",
      type: "group",
      label: f.contactInfo,
      fields: [
        { name: "address", type: "textarea", label: f.address },
        { name: "phone", type: "text", label: f.phone },
        { name: "email", type: "text", label: f.email },
        { name: "contactName", type: "text", label: f.contactName },
      ],
    },
    {
      name: "socialLinks",
      type: "array",
      label: f.socialLinks,
      defaultValue: defaultSocialLinks,
      fields: [
        {
          name: "platform",
          type: "text",
          required: true,
          label: f.platform,
          admin: { placeholder: "facebook, twitter, instagram, tiktok, pinterest" },
        },
        {
          name: "url",
          type: "text",
          required: true,
          label: f.url,
          admin: { placeholder: "https://www.facebook.com/yourpage" },
        },
      ],
    },
    { name: "copyright", type: "text", label: f.copyright },
    {
      name: "defaultSeo",
      type: "group",
      label: f.defaultSeo,
      fields: [
        { name: "title", type: "text", label: f.title },
        { name: "description", type: "textarea", label: f.description },
      ],
    },
    {
      name: "utilityPageSeo",
      type: "array",
      label: f.utilityPageSeo,
      fields: [
        { name: "route", type: "text", required: true, label: f.route },
        { name: "title", type: "text", required: true, label: f.title },
        { name: "description", type: "textarea", label: f.description },
        { name: "heading", type: "text", label: f.heading },
        { name: "subheading", type: "text", label: f.subheading },
      ],
    },
    {
      name: "shopLabels",
      type: "group",
      label: f.shopLabels,
      fields: [
        { name: "breadcrumb", type: "text", label: f.breadcrumb, defaultValue: "All products" },
        {
          name: "sortOptions",
          type: "array",
          label: f.sortOptions,
          fields: [
            {
              name: "value",
              type: "select",
              required: true,
              label: f.label,
              options: [
                { label: "New arrivals", value: "latest" },
                { label: "Oldest products", value: "oldest" },
                { label: "Bestsellers", value: "bestsellers" },
                { label: "Price: low to high", value: "price-asc" },
                { label: "Price: high to low", value: "price-desc" },
                { label: "Name: A–Z", value: "name-asc" },
                { label: "Name: Z–A", value: "name-desc" },
              ],
            },
            { name: "label", type: "text", required: true, label: f.label },
          ],
        },
      ],
    },
    {
      name: "authLabels",
      type: "group",
      label: f.authLabels,
      fields: [
        { name: "signInTitle", type: "text", label: f.signInTitle },
        { name: "signInSubtitle", type: "text", label: f.signInSubtitle },
        { name: "signUpTitle", type: "text", label: f.signUpTitle },
        { name: "signUpSubtitle", type: "text", label: f.signUpSubtitle },
      ],
    },
    {
      name: "paymentMethods",
      type: "array",
      label: f.paymentMethods,
      admin: {
        description: descriptions.paymentMethods,
      },
      fields: [
        {
          name: "icon",
          type: "upload",
          relationTo: "media",
          required: true,
          label: f.icon,
        },
      ],
    },
    {
      name: "merchantListing",
      type: "group",
      label: "Merchant listing (Google Product schema)",
      admin: {
        description:
          "Shop-wide shipping and return details for Product Offer JSON-LD on PDPs (Google Merchant listings). Leave blank to omit those fields — do not invent policy data.",
      },
      fields: [
        { name: "returnDays", type: "number", label: "Return window (days)" },
        {
          name: "returnFees",
          type: "text",
          label: "Return fees",
          admin: { placeholder: "free or amount description" },
        },
        {
          name: "returnMethod",
          type: "text",
          label: "Return method",
          admin: { placeholder: "ReturnByMail" },
        },
        {
          name: "returnCountry",
          type: "text",
          label: "Return policy country (ISO)",
          admin: { placeholder: "US" },
        },
        { name: "shippingRate", type: "number", label: "Default shipping rate" },
        {
          name: "shippingCurrency",
          type: "text",
          label: "Shipping currency (ISO)",
          admin: { placeholder: "USD" },
        },
        {
          name: "deliveryTimeMinDays",
          type: "number",
          label: "Delivery time min (days)",
        },
        {
          name: "deliveryTimeMaxDays",
          type: "number",
          label: "Delivery time max (days)",
        },
        {
          name: "shippingDestinationCountry",
          type: "text",
          label: "Shipping destination country (ISO)",
          admin: { placeholder: "US" },
        },
      ],
    },
    {
      name: "showroom",
      type: "group",
      label: "Showroom (LocalBusiness JSON-LD on homepage)",
      admin: {
        description:
          "Physical storefront for Google Maps / local SEO. Leave disabled if online-only. Emitted only on the homepage when enabled and address is complete.",
      },
      fields: [
        {
          name: "enabled",
          type: "checkbox",
          label: "Enable showroom schema",
          defaultValue: false,
        },
        {
          name: "name",
          type: "text",
          label: "Showroom name",
          admin: { description: "Defaults to site name when empty" },
        },
        {
          name: "type",
          type: "select",
          label: "Schema.org type",
          defaultValue: "Store",
          options: [
            { label: "Store", value: "Store" },
            { label: "SportingGoodsStore", value: "SportingGoodsStore" },
          ],
        },
        { name: "streetAddress", type: "text", label: "Street address" },
        { name: "addressLocality", type: "text", label: "City" },
        { name: "addressRegion", type: "text", label: "Region / state" },
        { name: "postalCode", type: "text", label: "Postal code" },
        {
          name: "addressCountry",
          type: "text",
          label: "Country (ISO)",
          admin: { placeholder: "US" },
        },
        { name: "telephone", type: "text", label: "Showroom phone" },
        { name: "latitude", type: "number", label: "Latitude" },
        { name: "longitude", type: "number", label: "Longitude" },
        {
          name: "openingHours",
          type: "textarea",
          label: "Opening hours",
          admin: { placeholder: "Mo-Fr 10:00-19:00" },
        },
      ],
    },
  ],
};

export const Navigation: GlobalConfig = {
  slug: "navigation",
  label: globals.navigation.singular,
  access: {
    read: publicRead,
    update: adminOnly,
  },
  hooks: { afterChange: [revalidateSiteGlobal] },
  fields: [
    {
      name: "items",
      type: "array",
      label: f.items,
      fields: navItemFields,
    },
  ],
};

export const Homepage: GlobalConfig = {
  slug: "homepage",
  label: "Home page",
  access: {
    read: publicRead,
    update: adminOnly,
  },
  hooks: { afterChange: [revalidateHomeGlobal] },
  fields: [
    {
      name: "sections",
      type: "group",
      label: f.sections,
      fields: [
        {
          name: "categories",
          type: "group",
          label: f.categories,
          fields: [
            { name: "enabled", type: "checkbox", label: f.enabled, defaultValue: true },
            { name: "eyebrow", type: "text", label: f.eyebrow, defaultValue: "Categories" },
            { name: "title", type: "text", label: f.title, defaultValue: "Browse by category" },
          ],
        },
        {
          name: "newArrivals",
          type: "group",
          label: "New arrivals",
          fields: [
            { name: "enabled", type: "checkbox", label: f.enabled, defaultValue: true },
            { name: "eyebrow", type: "text", label: f.eyebrow, defaultValue: "This week" },
            { name: "title", type: "text", label: f.title, defaultValue: "New arrivals" },
            { name: "ctaLabel", type: "text", label: f.ctaLabel, defaultValue: "View all" },
            { name: "ctaUrl", type: "text", label: f.ctaUrl, defaultValue: "/shop" },
          ],
        },
        {
          name: "bestSellers",
          type: "group",
          label: "Bestsellers",
          fields: [
            { name: "enabled", type: "checkbox", label: f.enabled, defaultValue: true },
            { name: "title", type: "text", label: f.title, defaultValue: "Bestsellers" },
            { name: "subtitle", type: "text", label: f.subtitle, defaultValue: "Top picks from our catalog" },
          ],
        },
        {
          name: "testimonials",
          type: "group",
          label: "Testimonials",
          fields: [
            { name: "enabled", type: "checkbox", label: f.enabled, defaultValue: true },
            { name: "eyebrow", type: "text", label: f.eyebrow, defaultValue: "Testimonials" },
            { name: "title", type: "text", label: f.title, defaultValue: "Customer reviews" },
          ],
        },
      ],
    },
    {
      name: "countdownPromo",
      type: "group",
      label: f.countdownPromo,
      fields: [
        { name: "enabled", type: "checkbox", label: f.enabled, defaultValue: true },
        { name: "eyebrow", type: "text", label: f.eyebrow },
        { name: "title", type: "text", label: f.title },
        { name: "body", type: "textarea", label: f.body },
        { name: "productName", type: "text", label: f.productName },
        { name: "deadline", type: "date", label: f.deadline },
        { name: "ctaLabel", type: "text", label: f.ctaLabel },
        { name: "ctaUrl", type: "text", label: f.ctaUrl },
        { name: "image", type: "upload", relationTo: "media", label: f.image },
      ],
    },
    {
      name: "newsletter",
      type: "group",
      label: f.newsletter,
      fields: [
        { name: "enabled", type: "checkbox", label: f.enabled, defaultValue: true },
        { name: "title", type: "text", label: f.title },
        { name: "subtitle", type: "text", label: f.subtitle },
        { name: "placeholder", type: "text", label: f.placeholder },
        { name: "bgImage", type: "upload", relationTo: "media", label: f.bgImage },
      ],
    },
  ],
};


export const FooterGlobal: GlobalConfig = {
  slug: "footer",
  label: globals.footer.singular,
  access: {
    read: publicRead,
    update: adminOnly,
  },
  hooks: { afterChange: [revalidateSiteGlobal] },
  fields: [
    preFooterBlocksField,
    { name: "helpTitle", type: "text", label: f.helpTitle, defaultValue: "Help and support" },
    {
      name: "columns",
      type: "array",
      label: f.columns,
      fields: [
        { name: "title", type: "text", required: true, label: f.title },
        {
          name: "links",
          type: "array",
          label: f.links,
          fields: linkFields,
        },
      ],
    },
    {
      name: "legalLinks",
      type: "array",
      label: f.legalLinks,
      fields: linkFields,
    },
  ],
};
