import type { Link } from "@medusajs/framework/modules-sdk";
import type {
  CreateProductWorkflowInputDTO,
  ExecArgs,
  FulfillmentWorkflow,
  IFulfillmentModuleService,
  IProductModuleService,
  IRegionModuleService,
  RegionDTO,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import {
  batchShippingOptionRulesWorkflow,
  createApiKeysWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  updateProductsWorkflow,
  updateRegionsWorkflow,
  updateShippingOptionsWorkflow,
  updateStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows";

type SeedContainer = ExecArgs["container"];

interface QueryGraph {
  graph: (input: {
    entity: string;
    fields: string[];
    filters?: Record<string, unknown>;
    pagination?: { skip: number; take: number };
  }) => Promise<{ data: Record<string, unknown>[] }>;
}

function isDuplicateError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("already assigned") ||
    message.includes("duplicate")
  );
}

export function getQuery(container: SeedContainer): QueryGraph {
  return container.resolve(ContainerRegistrationKeys.QUERY);
}

export async function findOneByName<T extends { id: string; name?: string }>(
  container: SeedContainer,
  entity: string,
  name: string,
  fields: string[] = ["id", "name"]
): Promise<T | undefined> {
  const query = getQuery(container);
  const { data } = await query.graph({
    entity,
    fields,
    filters: { name },
    pagination: { skip: 0, take: 1 },
  });

  return data[0] as T | undefined;
}

export async function findOneByFilter<T extends { id: string }>(
  container: SeedContainer,
  entity: string,
  filters: Record<string, unknown>,
  fields: string[] = ["id"]
): Promise<T | undefined> {
  const query = getQuery(container);
  const { data } = await query.graph({
    entity,
    fields,
    filters,
    pagination: { skip: 0, take: 1 },
  });

  return data[0] as T | undefined;
}

export async function findRegionByName(
  container: SeedContainer,
  name: string
): Promise<RegionDTO | undefined> {
  const regionModuleService = container.resolve<IRegionModuleService>(
    Modules.REGION
  );
  const [region] = await regionModuleService.listRegions({ name }, { take: 1 });
  return region;
}

export async function findRegionByCountry(
  container: SeedContainer,
  countryCode: string
): Promise<RegionDTO | undefined> {
  return await findOneByFilter<RegionDTO>(
    container,
    "region",
    { countries: { iso_2: countryCode } },
    ["id", "name", "currency_code"]
  );
}

export function getSeedPaymentProviders(
  apiKey = process.env.STRIPE_API_KEY
): string[] {
  return apiKey
    ? ["pp_stripe_stripe", "pp_system_default"]
    : ["pp_system_default"];
}

export async function getOrCreateRegion(
  container: SeedContainer,
  logger: Logger,
  input: {
    name: string;
    currency_code: string;
    countries: string[];
    payment_providers?: string[];
  }
): Promise<RegionDTO> {
  const providers = input.payment_providers ?? ["pp_system_default"];

  const ensureProviders = async (region: RegionDTO) => {
    try {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: { payment_providers: providers },
        },
      });
      logger.info(
        `Ensured payment providers on region "${input.name}": ${providers.join(", ")}`
      );
    } catch (error) {
      logger.warn(
        `Could not ensure payment providers on region "${input.name}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const existing = await findRegionByName(container, input.name);
  if (existing) {
    logger.info(`Region "${input.name}" already exists, reusing it.`);
    await ensureProviders(existing);
    return existing;
  }

  if (input.countries.length === 1) {
    const byCountry = await findRegionByCountry(container, input.countries[0]);
    if (byCountry) {
      logger.info(
        `Region for country "${input.countries[0]}" already exists, reusing it.`
      );
      await ensureProviders(byCountry);
      return byCountry;
    }
  }

  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: input.name,
          currency_code: input.currency_code,
          countries: input.countries,
          payment_providers: providers,
        },
      ],
    },
  });

  return result[0];
}

export async function ensureTaxRegions(
  container: SeedContainer,
  logger: Logger,
  countryCodes: string[]
) {
  const _query = getQuery(container);
  const missing: string[] = [];

  for (const country_code of countryCodes) {
    const existing = await findOneByFilter(
      container,
      "tax_region",
      { country_code },
      ["id", "country_code"]
    );

    if (existing) {
      continue;
    }

    missing.push(country_code);
  }

  if (!missing.length) {
    logger.info("Tax regions already exist for all countries, skipping.");
    return;
  }

  await createTaxRegionsWorkflow(container).run({
    input: missing.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });
}

export interface StockLocationAddressInput {
  city: string;
  country_code: string;
  address_1: string;
  province?: string;
  postal_code?: string;
}

export async function getOrCreateStockLocation(
  container: SeedContainer,
  logger: Logger,
  name: string,
  address: StockLocationAddressInput = {
    city: "San Francisco",
    country_code: "us",
    address_1: "123 Market Street",
    province: "CA",
    postal_code: "94105",
  }
) {
  const existing = await findOneByName<{
    id: string;
    name?: string;
    address?: Partial<StockLocationAddressInput> | null;
  }>(container, "stock_location", name, [
    "id",
    "name",
    "address.city",
    "address.country_code",
    "address.address_1",
    "address.province",
    "address.postal_code",
  ]);

  if (existing?.id) {
    const existingAddress = existing.address ?? {};
    const needsAddressUpdate =
      existingAddress.city !== address.city ||
      existingAddress.country_code !== address.country_code ||
      existingAddress.address_1 !== address.address_1 ||
      (address.province !== undefined &&
        existingAddress.province !== address.province) ||
      (address.postal_code !== undefined &&
        existingAddress.postal_code !== address.postal_code);

    if (needsAddressUpdate) {
      await updateStockLocationsWorkflow(container).run({
        input: {
          selector: { id: String(existing.id) },
          update: { address },
        },
      });
      logger.info(`Stock location "${name}" address updated.`);
    } else {
      logger.info(`Stock location "${name}" already exists, reusing it.`);
    }

    return existing;
  }

  const { result } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name,
          address,
        },
      ],
    },
  });

  return result[0];
}

export async function ensureLink(
  remoteLink: Link,
  logger: Logger,
  label: string,
  input: Parameters<Link["create"]>[0]
) {
  try {
    await remoteLink.create(input);
  } catch (error) {
    if (isDuplicateError(error)) {
      logger.info(`${label} link already exists, skipping.`);
      return;
    }

    throw error;
  }
}

export async function getOrCreateShippingProfile(
  container: SeedContainer,
  logger: Logger,
  name: string
) {
  const existing = await findOneByName(container, "shipping_profile", name, [
    "id",
    "name",
  ]);

  if (existing) {
    logger.info(`Shipping profile "${name}" already exists, reusing it.`);
    return existing;
  }

  const { result } = await createShippingProfilesWorkflow(container).run({
    input: {
      data: [
        {
          name,
          type: "default",
        },
      ],
    },
  });

  return result[0];
}

export async function getOrCreateFulfillmentSet(
  container: SeedContainer,
  logger: Logger,
  fulfillmentModuleService: IFulfillmentModuleService,
  input: {
    name: string;
    serviceZoneName: string;
    countryCodes: string[];
  }
) {
  const existing = await findOneByName(container, "fulfillment_set", input.name, [
    "id",
    "name",
    "service_zones.id",
  ]);

  if (existing?.id) {
    logger.info(`Fulfillment set "${input.name}" already exists, reusing it.`);
    return fulfillmentModuleService.retrieveFulfillmentSet(String(existing.id), {
      relations: ["service_zones"],
    });
  }

  return fulfillmentModuleService.createFulfillmentSets({
    name: input.name,
    type: "shipping",
    service_zones: [
      {
        name: input.serviceZoneName,
        geo_zones: input.countryCodes.map((country_code) => ({
          country_code,
          type: "country" as const,
        })),
      },
    ],
  });
}

const STOREFRONT_ENABLED_RULE = {
  attribute: "enabled_in_store",
  value: "true",
  operator: "eq" as const,
};

async function ensureShippingOptionStorefrontRules(
  container: SeedContainer,
  logger: Logger,
  optionId: string,
  optionName: string
) {
  const query = getQuery(container);
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "rules.id", "rules.attribute", "rules.value", "rules.operator"],
    filters: { id: optionId },
    pagination: { skip: 0, take: 1 },
  });

  const option = data[0] as
    | {
        id: string;
        rules?: {
          id: string;
          attribute?: string;
          value?: string;
          operator?: string;
        }[];
      }
    | undefined;

  if (!option) {
    return;
  }

  const rules = option.rules ?? [];
  const enabledRule = rules.find(
    (rule) => rule.attribute === STOREFRONT_ENABLED_RULE.attribute
  );

  if (!enabledRule) {
    await batchShippingOptionRulesWorkflow(container).run({
      input: {
        create: [
          {
            ...STOREFRONT_ENABLED_RULE,
            shipping_option_id: optionId,
          },
        ],
      },
    });
    logger.info(
      `Shipping option "${optionName}" enabled_in_store rule created.`
    );
    return;
  }

  if (enabledRule.value !== STOREFRONT_ENABLED_RULE.value) {
    await batchShippingOptionRulesWorkflow(container).run({
      input: {
        update: [
          {
            id: enabledRule.id,
            attribute: STOREFRONT_ENABLED_RULE.attribute,
            value: STOREFRONT_ENABLED_RULE.value,
            operator: STOREFRONT_ENABLED_RULE.operator,
          },
        ],
      },
    });
    logger.info(
      `Shipping option "${optionName}" enabled_in_store rule fixed.`
    );
  }
}

export async function ensureShippingOptions(
  container: SeedContainer,
  logger: Logger,
  options: FulfillmentWorkflow.CreateShippingOptionsWorkflowInput[]
) {
  const toCreate: FulfillmentWorkflow.CreateShippingOptionsWorkflowInput[] = [];

  for (const option of options) {
    const existing = await findOneByName(
      container,
      "shipping_option",
      option.name,
      ["id", "name"]
    );

    if (existing?.id) {
      logger.info(`Shipping option "${option.name}" already exists, reusing it.`);
      await ensureShippingOptionStorefrontRules(
        container,
        logger,
        String(existing.id),
        option.name
      );

      if (option.price_type === "flat" && option.prices.length) {
        await updateShippingOptionsWorkflow(container).run({
          input: [
            {
              id: String(existing.id),
              prices: option.prices,
            },
          ],
        });
      }

      continue;
    }

    toCreate.push(option);
  }

  if (!toCreate.length) {
    return;
  }

  await createShippingOptionsWorkflow(container).run({
    input: toCreate,
  });

  for (const option of toCreate) {
    logger.info(`Shipping option "${option.name}" created.`);
  }
}

export async function getOrCreatePublishableApiKey(
  container: SeedContainer,
  logger: Logger,
  title: string
) {
  const existing = await findOneByFilter(
    container,
    "api_key",
    { title, type: "publishable" },
    ["id", "title", "type"]
  );

  if (existing) {
    logger.info(`Publishable API key "${title}" already exists, reusing it.`);
    return existing;
  }

  const { result } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title,
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });

  return result[0];
}

interface CategorySeedInput {
  handle?: string;
  name: string;
  description: string;
  is_active: boolean;
  parent_category_id?: string | null;
  metadata?: Record<string, unknown>;
}

type ProductCategory = NonNullable<
  Awaited<ReturnType<IProductModuleService["listProductCategories"]>>
>[number];

function hasCategoryMetadataChanges(
  existing: ProductCategory,
  metadata: Record<string, unknown>
) {
  const current = (existing.metadata ?? {}) as Record<string, unknown>;
  return Object.entries(metadata).some(
    ([key, expected]) => current[key] !== expected
  );
}

async function reconcileExistingProductCategory(
  productModuleService: IProductModuleService,
  logger: Logger,
  category: CategorySeedInput,
  existing: ProductCategory
) {
  const needsParentUpdate =
    category.parent_category_id !== undefined &&
    existing.parent_category_id !== category.parent_category_id;

  if (category.metadata) {
    const current = (existing.metadata ?? {}) as Record<string, unknown>;
    const needsUpdate =
      hasCategoryMetadataChanges(existing, category.metadata) ||
      needsParentUpdate ||
      existing.description !== category.description;

    if (needsUpdate) {
      await productModuleService.updateProductCategories(existing.id, {
        description: category.description,
        ...(category.parent_category_id === undefined
          ? {}
          : { parent_category_id: category.parent_category_id }),
        metadata: {
          ...current,
          ...category.metadata,
        },
      });
      logger.info(`Category "${category.name}" metadata updated.`);
    } else {
      logger.info(`Category "${category.name}" already exists, reusing it.`);
    }
  } else if (needsParentUpdate) {
    await productModuleService.updateProductCategories(existing.id, {
      parent_category_id: category.parent_category_id,
    });
    logger.info(`Category "${category.name}" parent updated.`);
  } else {
    logger.info(`Category "${category.name}" already exists, reusing it.`);
  }
}

export async function getOrCreateProductCategories(
  container: SeedContainer,
  logger: Logger,
  categories: CategorySeedInput[]
) {
  const productModuleService = container.resolve<IProductModuleService>(
    Modules.PRODUCT
  );
  const result: ProductCategory[] = [];

  for (const category of categories) {
    const [existing] = await productModuleService.listProductCategories(
      { name: category.name },
      { take: 1 }
    );

    if (existing) {
      await reconcileExistingProductCategory(
        productModuleService,
        logger,
        category,
        existing
      );
      result.push(existing);
      continue;
    }

    const { result: created } = await createProductCategoriesWorkflow(
      container
    ).run({
      input: {
        product_categories: [category],
      },
    });

    result.push(created[0]);
  }

  return result;
}

export async function getOrCreateProductTag(
  container: SeedContainer,
  logger: Logger,
  value: string,
  metadata?: Record<string, unknown>
) {
  const productModuleService = container.resolve<IProductModuleService>(
    Modules.PRODUCT
  );
  const [existing] = await productModuleService.listProductTags(
    { value },
    { take: 1 }
  );

  if (existing) {
    if (metadata) {
      const current = (existing.metadata ?? {}) as Record<string, unknown>;
      const needsUpdate = Object.entries(metadata).some(
        ([key, expected]) => current[key] !== expected
      );

      if (needsUpdate) {
        await productModuleService.updateProductTags(existing.id, {
          metadata: {
            ...current,
            ...metadata,
          },
        } as Parameters<IProductModuleService["updateProductTags"]>[1]);
        logger.info(`Product tag "${value}" metadata updated.`);
      } else {
        logger.info(`Product tag "${value}" already exists, reusing it.`);
      }
    } else {
      logger.info(`Product tag "${value}" already exists, reusing it.`);
    }

    return existing;
  }

  const created = await productModuleService.createProductTags({
    value,
    ...(metadata ? { metadata } : {}),
  } as Parameters<IProductModuleService["createProductTags"]>[0]);

  return created;
}

export async function ensureProduct(
  container: SeedContainer,
  logger: Logger,
  handle: string,
  product: CreateProductWorkflowInputDTO
) {
  const productModuleService = container.resolve<IProductModuleService>(
    Modules.PRODUCT
  );
  const [existing] = await productModuleService.listProducts(
    { handle },
    { take: 1, relations: ["tags"] }
  );

  if (existing) {
    const update: {
      id: string;
      shipping_profile_id?: string;
      tag_ids?: string[];
    } = { id: existing.id };

    if (product.shipping_profile_id) {
      update.shipping_profile_id = product.shipping_profile_id;
    }

    if (product.tag_ids?.length) {
      update.tag_ids = product.tag_ids;
    }

    if (update.shipping_profile_id || update.tag_ids) {
      await updateProductsWorkflow(container).run({
        input: {
          products: [update],
        },
      });
      logger.info(`Product "${handle}" already exists, profile/tags synced.`);
    } else {
      logger.info(`Product "${handle}" already exists, skipping.`);
    }

    const [refreshed] = await productModuleService.listProducts(
      { handle },
      { take: 1, relations: ["variants", "tags"] }
    );

    return refreshed ?? existing;
  }

  await createProductsWorkflow(container).run({
    input: {
      products: [product],
    },
  });

  const [created] = await productModuleService.listProducts(
    { handle },
    { take: 1, relations: ["variants", "tags"] }
  );

  logger.info(`Product "${handle}" created.`);
  return created;
}

export async function ensureSalePriceList(
  container: SeedContainer,
  logger: Logger,
  input: {
    title: string;
    description: string;
    prices: {
      amount: number;
      currency_code: string;
      variant_id: string;
      rules?: Record<string, string>;
    }[];
  }
) {
  if (!input.prices.length) {
    logger.info(`Price list "${input.title}" skipped (no variant prices).`);
    return;
  }

  const existing = await findOneByFilter(
    container,
    "price_list",
    { title: input.title },
    ["id", "title"]
  );

  if (existing) {
    logger.info(`Price list "${input.title}" already exists, skipping.`);
    return existing;
  }

  // Medusa's CreatePriceListWorkflowInputDTO shape lags the runtime/API (title/type/prices).
  const { result } = await createPriceListsWorkflow(container).run({
    input: {
      price_lists_data: [
        {
          title: input.title,
          description: input.description,
          status: "active",
          type: "sale",
          rules: { currency_code: [input.prices[0].currency_code] },
          prices: input.prices,
        } as never,
      ],
    },
  });

  logger.info(`Price list "${input.title}" created.`);
  return result[0];
}

export async function runIdempotentWorkflow(
  logger: Logger,
  label: string,
  run: () => Promise<void>
) {
  try {
    await run();
  } catch (error) {
    if (isDuplicateError(error)) {
      logger.info(`${label} already applied, skipping.`);
      return;
    }

    throw error;
  }
}
