import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import { runUpdateBestsellerRankingsWorkflow } from "../workflows/update-bestseller-rankings";

export default async function updateBestsellerRankings({ container }: ExecArgs) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  logger.info("[bestseller-rankings] status=start source=cli");

  const result = await runUpdateBestsellerRankingsWorkflow(container);

  logger.info(
    `[bestseller-rankings] status=done window_days=${result.windowDays} orders_processed=${result.ordersProcessed} products_updated=${result.productsUpdated}`
  );
}
