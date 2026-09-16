
import { ProductStatus } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import {
  ensureProduct,
  ensureSalePriceList,
  getOrCreateProductCategories,
  getOrCreateProductTag,
} from "./seed-helpers";

type SeedContainer = Parameters<typeof ensureProduct>[0];

export async function seedLegacyApparelFixtures(
  container: SeedContainer,
  logger: Logger,
  {
    shippingProfileId,
    salesChannelId,
  }: { shippingProfileId: string; salesChannelId: string }
): Promise<void> {
  logger.info("Seeding legacy apparel product data...");

  const categoryResult = await getOrCreateProductCategories(container, logger, [
    {
      name: "Apparel",
      description:
        "Browse our apparel collection including shirts, sweatshirts, and pants.",
      is_active: true,
      metadata: {
        seo_title: "Apparel | Vulpy Commerce",
        seo_description:
          "Shop shirts, sweatshirts, and pants from our apparel collection.",
        image_url: "/images/icons/icon-02.svg",
      },
    },
    {
      name: "Merch",
      description: "Official Vulpy Commerce merchandise and accessories.",
      is_active: true,
      metadata: {
        seo_title: "Merch | Vulpy Commerce",
        seo_description:
          "Discover Vulpy Commerce merchandise and accessories.",
        image_url: "/images/icons/icon-03.svg",
      },
    },
  ]);

  const apparelCategoryId =
    categoryResult.find((cat) => cat.name === "Apparel")?.id ?? "";
  const merchCategoryId =
    categoryResult.find((cat) => cat.name === "Merch")?.id ?? "";

  const apparelChildCategories = await getOrCreateProductCategories(
    container,
    logger,
    [
      {
        name: "Shirts",
        description: "Comfortable everyday shirts for any occasion.",
        is_active: true,
        parent_category_id: apparelCategoryId,
        metadata: {
          seo_description:
            "Shop Vulpy Commerce t-shirts and shirts in multiple sizes and colors.",
          image_url: "/images/icons/icon-04.svg",
        },
      },
      {
        name: "Sweatshirts",
        description: "Cozy sweatshirts for casual wear.",
        is_active: true,
        parent_category_id: apparelCategoryId,
        metadata: {
          image_url: "/images/icons/icon-05.svg",
        },
      },
      {
        name: "Pants",
        description: "Relaxed-fit pants and sweatpants.",
        is_active: true,
        parent_category_id: apparelCategoryId,
        metadata: {
          image_url: "/images/icons/icon-06.svg",
        },
      },
    ]
  );

  const shirtsCategoryId =
    apparelChildCategories.find((cat) => cat.name === "Shirts")?.id ?? "";
  const sweatshirtsCategoryId =
    apparelChildCategories.find((cat) => cat.name === "Sweatshirts")?.id ?? "";
  const pantsCategoryId =
    apparelChildCategories.find((cat) => cat.name === "Pants")?.id ?? "";

  const shirtsChildCategories = await getOrCreateProductCategories(
    container,
    logger,
    [
      {
        name: "Tees",
        description: "T-shirts with varied pricing for storefront demos.",
        is_active: true,
        parent_category_id: shirtsCategoryId,
        metadata: {
          seo_description:
            "Shop Vulpy Commerce tees — price range, sale, and simple SKUs.",
          image_url: "/images/icons/icon-04.svg",
        },
      },
    ]
  );

  const teesCategoryId =
    shirtsChildCategories.find((cat) => cat.name === "Tees")?.id ?? "";

  const newTag = await getOrCreateProductTag(container, logger, "New", {
    show_in_store: true,
    color: "#10B981",
  });
  const bestsellerTag = await getOrCreateProductTag(
    container,
    logger,
    "Bestseller",
    {
      show_in_store: true,
      color: "#F59E0B",
    }
  );

  await ensureProduct(container, logger, "t-shirt", {
    title: "Medusa T-Shirt",
    category_ids: [shirtsCategoryId],
    description:
      "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
    handle: "t-shirt",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    tag_ids: [newTag.id, bestsellerTag.id],
    metadata: {
      full_description:
        "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary. Crafted from premium cotton with a relaxed fit, this tee is designed for all-day comfort.\n\nEach shirt is pre-washed for softness and features reinforced stitching at the shoulders and hem. Available in classic black and white with sizes from S to XL.",
      attributes: [
        { label: "Material", value: "100% Cotton" },
        { label: "Fit", value: "Regular" },
        { label: "Care", value: "Machine wash cold, tumble dry low" },
        { label: "Origin", value: "Portugal" },
      ],
    },
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-back.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-back.png",
      },
    ],
    options: [
      {
        title: "Size",
        values: ["S", "M", "L", "XL"],
      },
      {
        title: "Color",
        values: ["Black", "White"],
      },
    ],
    variants: [
      {
        title: "S / Black",
        sku: "SHIRT-S-BLACK",
        options: {
          Size: "S",
          Color: "Black",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "S / White",
        sku: "SHIRT-S-WHITE",
        options: {
          Size: "S",
          Color: "White",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "M / Black",
        sku: "SHIRT-M-BLACK",
        options: {
          Size: "M",
          Color: "Black",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "M / White",
        sku: "SHIRT-M-WHITE",
        options: {
          Size: "M",
          Color: "White",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "L / Black",
        sku: "SHIRT-L-BLACK",
        options: {
          Size: "L",
          Color: "Black",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "L / White",
        sku: "SHIRT-L-WHITE",
        options: {
          Size: "L",
          Color: "White",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "XL / Black",
        sku: "SHIRT-XL-BLACK",
        options: {
          Size: "XL",
          Color: "Black",
        },
        manage_inventory: true,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
      {
        title: "XL / White",
        sku: "SHIRT-XL-WHITE",
        options: {
          Size: "XL",
          Color: "White",
        },
        manage_inventory: false,
        prices: [{ amount: 10, currency_code: "usd" }],
      },
    ],
    sales_channels: [
      {
        id: salesChannelId,
      },
    ],
  });

  await ensureProduct(container, logger, "sweatshirt", {
    title: "Medusa Sweatshirt",
    category_ids: [sweatshirtsCategoryId],
    description:
      "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
    handle: "sweatshirt",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-back.png",
      },
    ],
    options: [
      {
        title: "Size",
        values: ["S", "M", "L", "XL"],
      },
    ],
    variants: [
      { title: "S", sku: "SWEATSHIRT-S", options: { Size: "S" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "M", sku: "SWEATSHIRT-M", options: { Size: "M" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "L", sku: "SWEATSHIRT-L", options: { Size: "L" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "XL", sku: "SWEATSHIRT-XL", options: { Size: "XL" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
    ],
    sales_channels: [{ id: salesChannelId }],
  });

  await ensureProduct(container, logger, "sweatpants", {
    title: "Medusa Sweatpants",
    category_ids: [pantsCategoryId],
    description:
      "Reimagine the feeling of classic sweatpants. With our cotton sweatpants, everyday essentials no longer have to be ordinary.",
    handle: "sweatpants",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-back.png",
      },
    ],
    options: [
      {
        title: "Size",
        values: ["S", "M", "L", "XL"],
      },
    ],
    variants: [
      { title: "S", sku: "SWEATPANTS-S", options: { Size: "S" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "M", sku: "SWEATPANTS-M", options: { Size: "M" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "L", sku: "SWEATPANTS-L", options: { Size: "L" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "XL", sku: "SWEATPANTS-XL", options: { Size: "XL" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
    ],
    sales_channels: [{ id: salesChannelId }],
  });

  const shortsProduct = await ensureProduct(container, logger, "shorts", {
    title: "Medusa Shorts",
    category_ids: [merchCategoryId],
    description:
      "Reimagine the feeling of classic shorts. With our cotton shorts, everyday essentials no longer have to be ordinary.",
    handle: "shorts",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-back.png",
      },
    ],
    options: [
      {
        title: "Size",
        values: ["S", "M", "L", "XL"],
      },
    ],
    variants: [
      { title: "S", sku: "SHORTS-S", options: { Size: "S" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "M", sku: "SHORTS-M", options: { Size: "M" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "L", sku: "SHORTS-L", options: { Size: "L" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
      { title: "XL", sku: "SHORTS-XL", options: { Size: "XL" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "usd" }] },
    ],
    sales_channels: [{ id: salesChannelId }],
  });

  const saleVariantIds =
    shortsProduct?.variants?.map((variant) => variant.id) ?? [];

  await ensureSalePriceList(container, logger, {
    title: "Seed Sale — Shorts",
    description: "Demo sale prices for Medusa Shorts",
    prices: saleVariantIds.map((variant_id) => ({
      amount: 7,
      currency_code: "usd",
      variant_id,
    })),
  });

  await ensureProduct(container, logger, "priced-tee-range", {
    title: "Priced Tee Range",
    category_ids: [teesCategoryId],
    description:
      "Demo tee with different prices by size so listings show From pricing.",
    handle: "priced-tee-range",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-back.png",
      },
    ],
    options: [
      {
        title: "Size",
        values: ["S", "M", "L"],
      },
    ],
    variants: [
      { title: "S", sku: "PRICED-TEE-RANGE-S", options: { Size: "S" }, manage_inventory: false, prices: [{ amount: 12, currency_code: "usd" }] },
      { title: "M", sku: "PRICED-TEE-RANGE-M", options: { Size: "M" }, manage_inventory: false, prices: [{ amount: 14, currency_code: "usd" }] },
      { title: "L", sku: "PRICED-TEE-RANGE-L", options: { Size: "L" }, manage_inventory: false, prices: [{ amount: 16, currency_code: "usd" }] },
    ],
    sales_channels: [{ id: salesChannelId }],
  });

  const pricedTeeSale = await ensureProduct(container, logger, "priced-tee-sale", {
    title: "Priced Tee Sale",
    category_ids: [teesCategoryId],
    description: "Demo tee on sale for strikethrough and percent-off badges.",
    handle: "priced-tee-sale",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
      },
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-back.png",
      },
    ],
    options: [
      {
        title: "Size",
        values: ["S", "M"],
      },
    ],
    variants: [
      { title: "S", sku: "PRICED-TEE-SALE-S", options: { Size: "S" }, manage_inventory: false, prices: [{ amount: 18, currency_code: "usd" }] },
      { title: "M", sku: "PRICED-TEE-SALE-M", options: { Size: "M" }, manage_inventory: false, prices: [{ amount: 18, currency_code: "usd" }] },
    ],
    sales_channels: [{ id: salesChannelId }],
  });

  const pricedTeeSaleVariantIds =
    pricedTeeSale?.variants?.map((variant) => variant.id) ?? [];

  await ensureSalePriceList(container, logger, {
    title: "Seed Sale — Priced Tee Sale",
    description: "Demo sale prices for Priced Tee Sale",
    prices: pricedTeeSaleVariantIds.map((variant_id) => ({
      amount: 12,
      currency_code: "usd",
      variant_id,
    })),
  });

  await ensureProduct(container, logger, "priced-tee-simple", {
    title: "Priced Tee Simple",
    category_ids: [teesCategoryId],
    description: "Single-SKU tee with one fixed price.",
    handle: "priced-tee-simple",
    weight: 400,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfileId,
    images: [
      {
        url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
      },
    ],
    options: [
      {
        title: "Default",
        values: ["One Size"],
      },
    ],
    variants: [
      {
        title: "One Size",
        sku: "PRICED-TEE-SIMPLE",
        options: { Default: "One Size" },
        manage_inventory: false,
        prices: [{ amount: 15, currency_code: "usd" }],
      },
    ],
    sales_channels: [{ id: salesChannelId }],
  });

  logger.info("Finished seeding legacy apparel product data.");
}
