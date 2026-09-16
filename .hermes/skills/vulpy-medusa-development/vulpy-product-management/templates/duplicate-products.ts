import type {
  CreateProductWorkflowInputDTO,
  ExecArgs,
  IProductModuleService,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Duplicate every product in the catalog (dev utility).
 *
 * Naming: title " (copy)", handle "<handle>-copy", SKUs "<SKU>-COPY".
 * Copies are published, keep all options/variants/prices/categories/tags/
 * sales channels, and record `metadata.duplicated_from` for traceability.
 *
 * Idempotent: skips any product whose "<handle>-copy" already exists.
 *
 * Run (from host checkout, or from Fox with DB host override — see
 * vulpy-product-management skill):
 *   pnpm --filter @apps/medusa-backend exec medusa exec ./src/scripts/duplicate-products.ts
 */
export default async function duplicateProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModuleService = container.resolve<IProductModuleService>(
    Modules.PRODUCT
  );

  const products = await productModuleService.listProducts(
    {},
    {
      take: 100,
      relations: [
        "variants",
        "variants.options",
        "options",
        "options.values",
        "images",
        "categories",
        "tags",
      ],
    }
  );

  // Sales channels live on the product<->sales_channel link module, not the
  // Product entity — resolve them via the remote query graph.
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: channelLinks } = await query.graph({
    entity: "product",
    fields: ["id", "sales_channels.id", "shipping_profile.id"],
    pagination: { skip: 0, take: 100 },
  });
  const linkRows = channelLinks as {
    id: string;
    sales_channels: { id: string }[];
    shipping_profile?: { id: string } | null;
  }[];
  const salesChannelIdsByProduct = new Map<string, string[]>(
    linkRows.map((product) => [
      product.id,
      (product.sales_channels ?? []).map((channel) => channel.id),
    ])
  );
  const shippingProfileIdByProduct = new Map<string, string | undefined>(
    linkRows.map((product) => [product.id, product.shipping_profile?.id])
  );

  // Variant prices live in the pricing module (linked, not a ProductVariant
  // relation) — resolve them through the remote query graph too.
  const { data: priceRows } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "variants.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    pagination: { skip: 0, take: 100 },
  });
  const pricesByVariant = new Map<string, { amount: number; currency_code: string }[]>(
    (priceRows as {
      variants: {
        id: string;
        prices?: { amount: number; currency_code: string }[];
      }[];
    }[]).flatMap((product) =>
      (product.variants ?? []).map((variant) => [
        variant.id,
        (variant.prices ?? []).map((price) => ({
          amount: price.amount,
          currency_code: price.currency_code,
        })),
      ])
    ) as [string, { amount: number; currency_code: string }[]][]
  );

  const created: string[] = [];
  const skipped: string[] = [];

  for (const product of products) {
    const copyHandle = `${product.handle}-copy`;

    const [existing] = await productModuleService.listProducts(
      { handle: copyHandle },
      { take: 1 }
    );
    if (existing) {
      skipped.push(product.title);
      logger.info(`"${product.title}" -> "${copyHandle}" already exists, skipping.`);
      continue;
    }

    const optionTitleById = new Map(
      (product.options ?? []).map((option) => [option.id, option.title])
    );

    const copy: CreateProductWorkflowInputDTO = {
      title: `${product.title} (copy)`,
      handle: copyHandle,
      description: product.description ?? undefined,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id:
        shippingProfileIdByProduct.get(product.id) ?? undefined,
      weight: product.weight ?? undefined,
      height: product.height ?? undefined,
      width: product.width ?? undefined,
      length: product.length ?? undefined,
      images: (product.images ?? []).map((image) => ({ url: image.url })),
      options: (product.options ?? []).map((option) => ({
        title: option.title,
        values: (option.values ?? []).map((value) => value.value),
      })),
      variants: (product.variants ?? []).map((variant) => ({
        title: variant.title,
        sku: variant.sku ? `${variant.sku}-COPY` : undefined,
        manage_inventory: variant.manage_inventory ?? false,
        allow_backorder: variant.allow_backorder ?? false,
        options: Object.fromEntries(
          (variant.options ?? [])
            .map((variantOption) => {
              const optionId = variantOption.option_id;
              const optionTitle = optionId
                ? optionTitleById.get(optionId)
                : undefined;
              return optionTitle
                ? ([optionTitle, variantOption.value] as [string, string])
                : null;
            })
            .filter((entry): entry is [string, string] => entry !== null)
        ),
        prices: (pricesByVariant.get(variant.id) ?? []).map((price) => ({
          amount: price.amount,
          currency_code: price.currency_code,
        })),
      })),
      category_ids: (product.categories ?? []).map((category) => category.id),
      sales_channels: (salesChannelIdsByProduct.get(product.id) ?? []).map(
        (salesChannelId) => ({ id: salesChannelId })
      ),
      tag_ids: (product.tags ?? []).map((tag) => tag.id),
      metadata: {
        ...(product.metadata ?? {}),
        duplicated_from: product.id,
      },
    };

    await createProductsWorkflow(container).run({
      input: { products: [copy] },
    });

    created.push(product.title);
    logger.info(`Duplicated "${product.title}" -> "${copyHandle}".`);
  }

  logger.info(
    `Duplicate products done: ${created.length} created, ${skipped.length} skipped (already exist).`
  );
}
