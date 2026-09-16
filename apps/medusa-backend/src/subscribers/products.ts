import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { isPayloadSyncSuppressed } from "../modules/payloadSync/suppress";
import { syncProductContentWorkflow } from "../workflows/sync-product-content";

export default async function productRevalidationHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const eventName =
    (event as { eventName?: string; name?: string }).eventName ||
    (event as { eventName?: string; name?: string }).name ||
    "product.updated";

  if (isPayloadSyncSuppressed()) {
    logger.debug(
      `[product-sync] status=skip reason=deferred_bulk_sync event=${eventName} product_id=${event.data.id}`
    );
    return;
  }

  try {
    await syncProductContentWorkflow(container).run({
      input: {
        eventName,
        productId: event.data.id,
        source: "product-subscriber",
      },
    });

    logger.info(
      `[product-sync] status=success event=${eventName} product_id=${event.data.id}`
    );
  } catch (error) {
    logger.error(
      `[product-sync] status=error event=${eventName} product_id=${event.data.id} error=${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
};
