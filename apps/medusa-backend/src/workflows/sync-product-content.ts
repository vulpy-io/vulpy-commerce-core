import type {
  IProductModuleService,
  Logger,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  PAYLOAD_SYNC_MODULE,
} from "../modules/payloadSync";
import type PayloadSyncModuleService from "../modules/payloadSync/service";

interface WorkflowInput {
  eventName: string;
  productId: string;
  source?: string;
}

interface SyncStepResult {
  status: "upserted" | "deleted" | "missing";
  productId: string;
  handle?: string;
}

let consecutiveSyncFailures = 0;

const syncProductContentStep = createStep(
  "sync-product-content",
  async (input: WorkflowInput, { container }) => {
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const productService = container.resolve<IProductModuleService>(Modules.PRODUCT);
    const payloadSyncService = container.resolve<PayloadSyncModuleService>(PAYLOAD_SYNC_MODULE);
    const startedAt = Date.now();

    if (!process.env.PAYLOAD_SYNC_API_KEY?.trim()) {
      const durationMs = Date.now() - startedAt;
      logger.info(
        `[payload-sync] status=skip reason=missing_api_key event=${input.eventName} product_id=${input.productId} duration_ms=${durationMs}`
      );
      return new StepResponse<SyncStepResult>({
        status: "missing",
        productId: input.productId,
      });
    }

    logger.info(
      `[payload-sync] status=start event=${input.eventName} product_id=${input.productId}`
    );

    try {
      if (input.eventName === "product.deleted") {
        const deleted = await payloadSyncService.deleteByMedusaProductId(input.productId);
        const durationMs = Date.now() - startedAt;
        consecutiveSyncFailures = 0;
        logger.info(
          `[payload-sync] status=success action=delete event=${input.eventName} product_id=${input.productId} deleted=${deleted} duration_ms=${durationMs}`
        );
        return new StepResponse<SyncStepResult>({
          status: deleted ? "deleted" : "missing",
          productId: input.productId,
        });
      }

      const product = await productService.retrieveProduct(input.productId, {
        withDeleted: true,
      });

      if (!(product?.handle && product?.title)) {
        const durationMs = Date.now() - startedAt;
        consecutiveSyncFailures = 0;
        logger.warn(
          `[payload-sync] status=skip reason=missing_product_fields event=${input.eventName} product_id=${input.productId} duration_ms=${durationMs}`
        );
        return new StepResponse<SyncStepResult>({
          status: "missing",
          productId: input.productId,
        });
      }

      await payloadSyncService.upsertProductContent({
        medusaProductId: product.id,
        handle: product.handle,
        title: product.title,
        source: input.source || "medusa-event",
      });

      const durationMs = Date.now() - startedAt;
      consecutiveSyncFailures = 0;
      logger.info(
        `[payload-sync] status=success action=upsert event=${input.eventName} product_id=${product.id} handle=${product.handle} duration_ms=${durationMs}`
      );

      return new StepResponse<SyncStepResult>({
        status: "upserted",
        productId: product.id,
        handle: product.handle,
      });
    } catch (error) {
      consecutiveSyncFailures += 1;
      const alertThreshold = Number(process.env.PAYLOAD_SYNC_ALERT_THRESHOLD || "5");
      const durationMs = Date.now() - startedAt;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `[payload-sync] status=error event=${input.eventName} product_id=${input.productId} duration_ms=${durationMs} error_code=sync_failure error_message=${errorMessage}`
      );

      if (consecutiveSyncFailures >= alertThreshold) {
        logger.error(
          `[payload-sync] status=alert reason=consecutive_failures threshold=${alertThreshold} consecutive_failures=${consecutiveSyncFailures}`
        );
      }

      throw error;
    }
  }
);

export const syncProductContentWorkflow = createWorkflow(
  "sync-product-content",
  (input: WorkflowInput) => {
    const result = syncProductContentStep(input);
    return new WorkflowResponse(result);
  }
);
