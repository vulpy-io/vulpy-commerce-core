import type { MedusaRequest } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, ProductStatus, QueryContext } from "@medusajs/framework/utils";
import { create, insertMultiple, type Orama, search } from "@orama/orama";
import {
  wrapVariantsWithInventoryQuantityForSalesChannel,
  wrapVariantsWithTotalInventoryQuantity,
} from "../../lib/medusa-product-api-internals";

const SEARCH_INDEX_TTL_MS = 15 * 60 * 1000;
const PAGE_SIZE = 200;

export const productSearchSchema = {
  id: "string",
  title: "string",
  handle: "string",
  description: "string",
  thumbnail: "string",
  model: "string",
  skus: "string",
  category_ids: "string[]",
  categories: "string[]",
} as const;

type ProductSearchSchema = typeof productSearchSchema;

interface Price {
  calculated_amount: number;
  original_amount: number;
  currency_code: string;
}

interface SearchVariant {
  id: string;
  title: string;
  sku: string | null;
  manage_inventory?: boolean;
  inventory_quantity?: number | null;
  options: Array<{ option_title: string; value: string }>;
  calculated_price: Price | null;
}

export interface ProductSearchHit {
  id: string;
  title: string;
  handle: string;
  description: string;
  thumbnail: string;
  model: string;
  category_ids: string[];
  categories: string[];
  filterable_attributes: Record<string, string>;
  variants: SearchVariant[];
}

export interface ProductSearchResult {
  count: number;
  limit: number;
  offset: number;
  hits: ProductSearchHit[];
}

interface IndexedProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  thumbnail: string;
  model: string;
  skus: string;
  category_ids: string[];
  categories: string[];
}

interface ProductSearchState {
  db: Orama<ProductSearchSchema> | null;
  documents: IndexedProduct[];
  builtAt: number;
  rebuildPromise: Promise<void> | null;
}

const state: ProductSearchState = {
  db: null,
  documents: [],
  builtAt: 0,
  rebuildPromise: null,
};

type ProductSearchRequest = MedusaRequest & {
  publishable_key_context?: {
    sales_channel_ids?: string[];
  };
};

async function wrapVariantInventory(
  req: ProductSearchRequest,
  variants: Record<string, unknown>[]
) {
  if (!variants.length) {
    return;
  }

  req.validatedQuery ??= {};

  if (req.publishable_key_context?.sales_channel_ids?.length) {
    await wrapVariantsWithInventoryQuantityForSalesChannel(req, variants);
    return;
  }

  await wrapVariantsWithTotalInventoryQuantity(req, variants);
}

const MODEL_ATTRIBUTE_LABEL = "Model";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function extractProductModelFromMetadata(metadata: unknown): string {
  if (!(metadata && typeof metadata === "object")) {
    return "";
  }

  const attributes = (metadata as Record<string, unknown>).attributes;
  if (!Array.isArray(attributes)) {
    return "";
  }

  for (const item of attributes) {
    if (
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).label === MODEL_ATTRIBUTE_LABEL &&
      typeof (item as Record<string, unknown>).value === "string"
    ) {
      return ((item as Record<string, unknown>).value as string).trim();
    }
  }

  return "";
}

export function toIndexedProductDocument(product: Record<string, unknown>): IndexedProduct {
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];

  const categoryIds = categories
    .map((category) =>
      category && typeof category === "object"
        ? asString((category as Record<string, unknown>).id)
        : ""
    )
    .filter(Boolean);

  const categoryNames = categories
    .map((category) =>
      category && typeof category === "object"
        ? asString((category as Record<string, unknown>).name)
        : ""
    )
    .filter(Boolean);

  const skus = variants
    .map((variant) =>
      variant && typeof variant === "object"
        ? asString((variant as Record<string, unknown>).sku)
        : ""
    )
    .filter(Boolean)
    .join(" ");

  return {
    id: asString(product.id),
    title: asString(product.title),
    handle: asString(product.handle),
    description: asString(product.description),
    thumbnail: asString(product.thumbnail),
    model: extractProductModelFromMetadata(product.metadata),
    skus,
    category_ids: categoryIds,
    categories: categoryNames,
  };
}

async function fetchAllIndexedProducts(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const products: IndexedProduct[] = [];
  let skip = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount) {
    const { data = [], metadata } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "description",
        "thumbnail",
        "metadata",
        "categories.id",
        "categories.name",
        "variants.sku",
      ],
      filters: {
        status: ProductStatus.PUBLISHED,
      },
      pagination: {
        skip,
        take: PAGE_SIZE,
      },
    });

    if (!data.length) {
      break;
    }

    products.push(...(data as Record<string, unknown>[]).map(toIndexedProductDocument));
    totalCount = metadata?.count ?? products.length;
    skip += data.length;

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return products.filter((product) => product.id.length > 0);
}

async function ensureIndex(container: MedusaContainer) {
  const isStale = Date.now() - state.builtAt > SEARCH_INDEX_TTL_MS;
  if (state.db && !isStale) {
    return state.db;
  }

  if (state.rebuildPromise) {
    await state.rebuildPromise;
    if (state.db) {
      return state.db;
    }
  }

  state.rebuildPromise = (async () => {
    const indexedProducts = await fetchAllIndexedProducts(container);
    const db = create({ schema: productSearchSchema });
    await insertMultiple(db, indexedProducts);

    state.db = db;
    state.documents = indexedProducts;
    state.builtAt = Date.now();
  })();

  try {
    await state.rebuildPromise;
  } finally {
    state.rebuildPromise = null;
  }

  if (!state.db) {
    throw new Error("Search index was not initialized");
  }

  return state.db;
}

async function resolvePricingContext(container: MedusaContainer, regionId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { id: regionId },
  });

  const region = regions?.[0] as { id: string; currency_code: string } | undefined;
  if (!(region?.id && region.currency_code)) {
    throw new Error(`Region with id ${regionId} was not found`);
  }

  return {
    region_id: region.id,
    currency_code: region.currency_code,
  };
}

function extractPrice(variant: Record<string, unknown>): Price | null {
  const calculatedPrice = variant.calculated_price;
  if (!(calculatedPrice && typeof calculatedPrice === "object")) {
    return null;
  }

  const price = calculatedPrice as Record<string, unknown>;
  if (
    typeof price.calculated_amount !== "number" ||
    typeof price.original_amount !== "number" ||
    typeof price.currency_code !== "string"
  ) {
    return null;
  }

  return {
    calculated_amount: price.calculated_amount,
    original_amount: price.original_amount,
    currency_code: price.currency_code,
  };
}

function mapSearchHit(product: Record<string, unknown>): ProductSearchHit {
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const metadata =
    product.metadata && typeof product.metadata === "object"
      ? (product.metadata as Record<string, unknown>)
      : {};
  const filterableAttributes =
    metadata.filterable && typeof metadata.filterable === "object"
      ? Object.fromEntries(
          Object.entries(metadata.filterable as Record<string, unknown>)
            .filter(
              ([, value]) => typeof value === "string" && value.trim().length > 0
            )
            .map(([key, value]) => [key, (value as string).trim()])
        )
      : {};

  return {
    id: asString(product.id),
    title: asString(product.title),
    handle: asString(product.handle),
    description: asString(product.description),
    thumbnail: asString(product.thumbnail),
    model: extractProductModelFromMetadata(metadata),
    category_ids: categories
      .map((category) =>
        category && typeof category === "object"
          ? asString((category as Record<string, unknown>).id)
          : ""
      )
      .filter(Boolean),
    categories: categories
      .map((category) =>
        category && typeof category === "object"
          ? asString((category as Record<string, unknown>).name)
          : ""
      )
      .filter(Boolean),
    filterable_attributes: filterableAttributes,
    variants: variants
      .filter((variant) => variant && typeof variant === "object")
      .map((variant) => {
        const source = variant as Record<string, unknown>;
        const options = Array.isArray(source.options) ? source.options : [];

        return {
          id: asString(source.id),
          title: asString(source.title),
          sku: asString(source.sku) || null,
          manage_inventory:
            typeof source.manage_inventory === "boolean"
              ? source.manage_inventory
              : undefined,
          inventory_quantity:
            typeof source.inventory_quantity === "number"
              ? source.inventory_quantity
              : null,
          options: options
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => {
              const option = entry as Record<string, unknown>;
              const optionTitle =
                option.option &&
                typeof option.option === "object" &&
                typeof (option.option as Record<string, unknown>).title === "string"
                  ? asString((option.option as Record<string, unknown>).title)
                  : "";
              const value = asString(option.value);

              return {
                option_title: optionTitle,
                value,
              };
            })
            .filter(
              (entry) => entry.option_title.length > 0 && entry.value.length > 0
            ),
          calculated_price: extractPrice(source),
        };
      }),
  };
}

async function fetchProductsForHits(
  req: ProductSearchRequest,
  container: MedusaContainer,
  productIds: string[],
  regionId: string
) {
  if (!productIds.length) {
    return [];
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pricingContext = await resolvePricingContext(container, regionId);

  const { data = [] } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "description",
      "thumbnail",
      "metadata",
      "categories.id",
      "categories.name",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.inventory_quantity",
      "variants.options.value",
      "variants.options.option.title",
      "variants.calculated_price.*",
    ],
    filters: {
      id: productIds,
      status: ProductStatus.PUBLISHED,
    },
    context: {
      variants: {
        calculated_price: QueryContext(pricingContext),
      },
    },
  });

  const rawProducts = data as Record<string, unknown>[];
  const variants = rawProducts.flatMap((product) => {
    const productVariants = product.variants;
    return Array.isArray(productVariants) ? productVariants : [];
  });
  await wrapVariantInventory(req, variants);

  const productsById = new Map(
    rawProducts.map((product) => [asString(product.id), mapSearchHit(product)])
  );

  return productIds.map((id) => productsById.get(id)).filter(Boolean) as ProductSearchHit[];
}

export function invalidateProductSearchIndex() {
  state.db = null;
  state.documents = [];
  state.builtAt = 0;
  state.rebuildPromise = null;
}

function searchWithSubstringFallback(
  documents: IndexedProduct[],
  {
    term,
    categoryIds,
    limit,
    offset,
  }: {
    term: string;
    categoryIds?: string[];
    limit: number;
    offset: number;
  }
) {
  const normalizedTerm = normalizeText(term);
  const hasQuery = normalizedTerm.length > 0;
  const hasCategoryFilter = Boolean(categoryIds?.length);

  const filtered = documents.filter((document) => {
    if (
      hasCategoryFilter &&
      !document.category_ids.some((categoryId) => categoryIds?.includes(categoryId))
    ) {
      return false;
    }

    if (!hasQuery) {
      return true;
    }

    const fields = [
      document.title,
      document.model,
      document.description,
      document.skus,
      ...document.categories,
    ]
      .map(normalizeText)
      .filter(Boolean);

    return fields.some((field) => field.includes(normalizedTerm));
  });

  if (!hasQuery) {
    return {
      count: filtered.length,
      ids: filtered.slice(offset, offset + limit).map((entry) => entry.id),
    };
  }

  const ranked = filtered
    .map((document) => {
      const title = normalizeText(document.title);
      const model = normalizeText(document.model);
      const description = normalizeText(document.description);
      const score =
        (title.startsWith(normalizedTerm) ? 50 : 0) +
        (model.startsWith(normalizedTerm) ? 40 : 0) +
        (title.includes(normalizedTerm) ? 20 : 0) +
        (model.includes(normalizedTerm) ? 20 : 0) +
        (description.includes(normalizedTerm) ? 5 : 0);

      return { id: document.id, score };
    })
    .sort((a, b) => b.score - a.score);

  return {
    count: ranked.length,
    ids: ranked.slice(offset, offset + limit).map((entry) => entry.id),
  };
}

export async function searchProducts(
  req: ProductSearchRequest,
  {
    term,
    limit,
    offset,
    categoryIds,
    regionId,
  }: {
    term: string;
    limit: number;
    offset: number;
    categoryIds?: string[];
    regionId: string;
  }
): Promise<ProductSearchResult> {
  const container = req.scope;
  const db = await ensureIndex(container);
  const where: Record<string, unknown> = {};

  if (categoryIds?.length) {
    where.category_ids = categoryIds;
  }

  let hitIds: string[] = [];
  let count = 0;

  const result = await search(db, {
    term,
    limit,
    offset,
    ...(Object.keys(where).length > 0 ? { where } : {}),
  });

  hitIds = result.hits
    .map((hit) => asString((hit.document as Record<string, unknown>).id))
    .filter(Boolean);
  count = result.count;

  if (count === 0 && term.trim().length > 0) {
    const fallback = searchWithSubstringFallback(state.documents, {
      term,
      categoryIds,
      limit,
      offset,
    });
    hitIds = fallback.ids;
    count = fallback.count;
  }

  const hits = await fetchProductsForHits(req, container, hitIds, regionId);

  return {
    count,
    limit,
    offset,
    hits,
  };
}
