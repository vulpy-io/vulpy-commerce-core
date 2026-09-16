import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { isPayloadSyncSuppressed } from "../modules/payloadSync/suppress";
import { syncCategoryContentWorkflow } from "../workflows/sync-category-content";

export default async function categoryPayloadSyncHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const eventName =
    (event as { eventName?: string; name?: string }).eventName ||
    (event as { eventName?: string; name?: string }).name ||
    "product-category.updated";

  if (isPayloadSyncSuppressed()) {
    logger.debug(
      `[category-sync] status=skip reason=deferred_bulk_sync event=${eventName} category_id=${event.data.id}`
    );
    return;
  }

  try {
    await syncCategoryContentWorkflow(container).run({
      input: {
        eventName,
        categoryId: event.data.id,
        source: "category-subscriber",
      },
    });

    logger.info(
      `[category-sync] status=success event=${eventName} category_id=${event.data.id}`
    );
  } catch (error) {
    logger.error(
      `[category-sync] status=error event=${eventName} category_id=${event.data.id} error=${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const config: SubscriberConfig = {
  event: [
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
  ],
};
