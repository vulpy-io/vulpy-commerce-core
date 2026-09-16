import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import { warmShopCatalogCache } from "../modules/shopCatalog/shop-catalog-service";

export default async function warmShopCatalogCacheScript(container: MedusaContainer) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id"],
    pagination: {
      take: 1,
    },
  });

  const regionId = (regions?.[0] as { id?: string } | undefined)?.id;
  if (!regionId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No region found for shop catalog warm-up"
    );
  }

  const result = await warmShopCatalogCache(container, regionId);
  logger.info(
    `[shop-catalog-cache] status=warmed region_id=${result.regionId} bestseller_key=${result.bestsellerIdsKey}`
  );
}
