import type {
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import {
  invalidateShopCatalogCache,
  setCachedBestsellerProductIds,
} from "../shopCatalog/shop-catalog-cache";

const DEFAULT_WINDOW_DAYS = 30;
const ORDER_BATCH_SIZE = 100;
const PRODUCT_BATCH_SIZE = 50;
const EXCLUDED_ORDER_STATUSES = new Set(["canceled", "draft", "archived"]);

interface OrderItemRecord {
  quantity?: number | null;
  product_id?: string | null;
}

interface OrderRecord {
  status?: string | null;
  items?: OrderItemRecord[] | null;
}

export interface BestsellerRankingsResult {
  windowDays: number;
  ordersProcessed: number;
  productsUpdated: number;
}

function getWindowDays() {
  const parsed = Number.parseInt(process.env.BESTSELLER_WINDOW_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS;
}

function getWindowStart(windowDays: number) {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  return windowStart;
}

function addOrderItemsToSales(
  order: OrderRecord,
  salesByProductId: Map<string, number>
) {
  for (const item of order.items ?? []) {
    const productId = item.product_id;
    const quantity = item.quantity ?? 0;

    if (!productId || quantity <= 0) {
      continue;
    }

    salesByProductId.set(
      productId,
      (salesByProductId.get(productId) ?? 0) + quantity
    );
  }
}

function countOrderSales(
  batch: OrderRecord[],
  salesByProductId: Map<string, number>
) {
  let ordersProcessed = 0;

  for (const order of batch) {
    if (order.status && EXCLUDED_ORDER_STATUSES.has(order.status)) {
      continue;
    }

    ordersProcessed += 1;
    addOrderItemsToSales(order, salesByProductId);
  }

  return ordersProcessed;
}

async function aggregateSalesCounts(
  container: MedusaContainer,
  windowStart: Date
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const salesByProductId = new Map<string, number>();
  let skip = 0;
  let ordersProcessed = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount) {
    const { data: orders, metadata } = await query.graph({
      entity: "order",
      fields: ["id", "status", "items.quantity", "items.product_id"],
      filters: {
        created_at: {
          $gte: windowStart.toISOString(),
        },
      },
      pagination: {
        skip,
        take: ORDER_BATCH_SIZE,
      },
    });

    const batch = (orders ?? []) as OrderRecord[];
    if (!batch.length) {
      break;
    }

    ordersProcessed += countOrderSales(batch, salesByProductId);

    totalCount = metadata?.count ?? skip + batch.length;
    skip += batch.length;

    if (batch.length < ORDER_BATCH_SIZE) {
      break;
    }
  }

  return { salesByProductId, ordersProcessed };
}

async function listAllProducts(productService: IProductModuleService) {
  const products: Array<{
    id: string;
    created_at?: string | Date | null;
    metadata?: Record<string, unknown> | null;
  }> = [];
  let skip = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount) {
    const [batch, count] = await productService.listAndCountProducts(
      {},
      {
        select: ["id", "created_at", "metadata"],
        skip,
        take: PRODUCT_BATCH_SIZE,
      }
    );

    products.push(...batch);
    totalCount = count;
    skip += batch.length;

    if (!batch.length) {
      break;
    }
  }

  return products;
}

function productCreatedAt(createdAt?: string | Date | null) {
  if (!createdAt) {
    return 0;
  }

  const timestamp = Date.parse(String(createdAt));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function calculateBestsellerRankings(
  container: MedusaContainer
): Promise<BestsellerRankingsResult> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const productService = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const windowDays = getWindowDays();
  const windowStart = getWindowStart(windowDays);
  const updatedAt = new Date().toISOString();

  const { salesByProductId, ordersProcessed } = await aggregateSalesCounts(
    container,
    windowStart
  );
  const products = await listAllProducts(productService);

  let productsUpdated = 0;

  for (const product of products) {
    const salesCount = salesByProductId.get(product.id) ?? 0;
    const currentMetadata = (product.metadata ?? {}) as Record<string, unknown>;
    const currentSalesCount = Number(currentMetadata.sales_count ?? 0);

    if (currentSalesCount === salesCount) {
      continue;
    }

    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: product.id,
            metadata: {
              ...currentMetadata,
              sales_count: salesCount,
              sales_count_updated_at: updatedAt,
            },
          },
        ],
      },
    });

    productsUpdated += 1;
  }

  const rankedProductIds = products
    .map((product) => ({
      id: product.id,
      salesCount: salesByProductId.get(product.id) ?? 0,
      createdAt: productCreatedAt(product.created_at),
    }))
    .sort((left, right) => {
      if (right.salesCount !== left.salesCount) {
        return right.salesCount - left.salesCount;
      }

      return right.createdAt - left.createdAt;
    })
    .map((product) => product.id);

  await setCachedBestsellerProductIds(rankedProductIds);
  await invalidateShopCatalogCache();

  logger.info(
    `[bestseller-rankings] status=done window_days=${windowDays} orders_processed=${ordersProcessed} products_updated=${productsUpdated}`
  );

  return {
    windowDays,
    ordersProcessed,
    productsUpdated,
  };
}
