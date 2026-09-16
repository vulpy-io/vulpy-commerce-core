import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { invalidateShopCatalogCache } from "../modules/shopCatalog/shop-catalog-cache";

export default async function shopCatalogCacheInvalidationHandler({
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);

  try {
    await invalidateShopCatalogCache();
    logger.debug("[shop-catalog-cache] status=invalidated");
  } catch (error) {
    logger.error(
      `[shop-catalog-cache] status=error error=${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
};
