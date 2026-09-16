import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { invalidateProductSearchIndex } from "../modules/productSearch";

export default function productSearchSubscriber({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  invalidateProductSearchIndex();

  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const eventName =
    (event as { eventName?: string; name?: string }).eventName ||
    (event as { eventName?: string; name?: string }).name ||
    "product.updated";

  logger.debug(
    `[store/search] status=index_invalidated event=${eventName} product_id=${event.data.id}`
  );
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
};
