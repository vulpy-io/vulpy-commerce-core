/** English copy for custom Medusa Admin UI (widgets, custom pages). */
export const adminLabelsEn = {
  common: {
    save: "Save",
    remove: "Remove",
    image: "Image",
  },
  productTagStorefront: {
    title: "Storefront display",
    description: "Control whether this tag appears on the storefront.",
    showInStore: "Show in store",
    badgeColor: "Badge color",
    badgeColorAria: "Tag badge color",
    saved: "Storefront settings saved",
    saveFailed: "Could not save storefront settings",
  },
  payloadCrosslinks: {
    title: "Storefront & Payload",
    productDescription: "Quick links to the product page and content editor.",
    categoryDescription: "Quick links to the category page and content editor.",
    viewOnStorefront: "View on storefront",
    editInPayload: "Edit in Payload",
  },
  categoryStorefrontImage: {
    title: "Storefront image",
    description: "Upload an image for category blocks on the storefront.",
    replaceImage: "Replace image",
    uploadImage: "Upload image",
    navAllLabel: "“All” menu label",
    navAllPlaceholder: "All {name}",
    navAllHint:
      'Optional. When empty, the dropdown uses "All [category name]".',
    previewAlt: "Category preview",
    saved: "Category image saved",
    saveFailed: "Could not save category image",
    uploadFailed: "Could not upload category image",
    invalidFileType: "Upload an image in JPEG, PNG, WebP, GIF, or SVG format.",
    missingUploadUrl: "No file URL was returned after upload.",
  },
} as const;

export type AdminLabelsEn = typeof adminLabelsEn;
