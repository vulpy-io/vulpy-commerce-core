import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import { runUpdateBestsellerRankingsWorkflow } from "../workflows/update-bestseller-rankings";

export default async function bestsellerRankingsJob(container: MedusaContainer) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  logger.info("[bestseller-rankings] status=start source=job");

  try {
    const result = await runUpdateBestsellerRankingsWorkflow(container);
    logger.info(
      `[bestseller-rankings] status=done window_days=${result.windowDays} orders_processed=${result.ordersProcessed} products_updated=${result.productsUpdated}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[bestseller-rankings] status=failed error=${message}`);
    throw error;
  }
}

export const config = {
  name: "bestseller-rankings",
  schedule: process.env.BESTSELLER_RANKINGS_CRON || "0 3 * * *",
};
