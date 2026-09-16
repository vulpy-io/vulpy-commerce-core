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
  categoryId: string;
  source?: string;
}

interface SyncStepResult {
  status: "upserted" | "deleted" | "missing";
  categoryId: string;
  handle?: string;
}

let consecutiveSyncFailures = 0;

const syncCategoryContentStep = createStep(
  "sync-category-content",
  async (input: WorkflowInput, { container }) => {
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const productService = container.resolve<IProductModuleService>(Modules.PRODUCT);
    const payloadSyncService = container.resolve<PayloadSyncModuleService>(PAYLOAD_SYNC_MODULE);
    const startedAt = Date.now();

    if (!process.env.PAYLOAD_SYNC_API_KEY?.trim()) {
      const durationMs = Date.now() - startedAt;
      logger.info(
        `[payload-sync] status=skip reason=missing_api_key event=${input.eventName} category_id=${input.categoryId} duration_ms=${durationMs}`
      );
      return new StepResponse<SyncStepResult>({
        status: "missing",
        categoryId: input.categoryId,
      });
    }

    logger.info(
      `[payload-sync] status=start event=${input.eventName} category_id=${input.categoryId}`
    );

    try {
      if (input.eventName === "product-category.deleted") {
        const deleted = await payloadSyncService.deleteByMedusaCategoryId(input.categoryId);
        const durationMs = Date.now() - startedAt;
        consecutiveSyncFailures = 0;
        logger.info(
          `[payload-sync] status=success action=delete event=${input.eventName} category_id=${input.categoryId} deleted=${deleted} duration_ms=${durationMs}`
        );
        return new StepResponse<SyncStepResult>({
          status: deleted ? "deleted" : "missing",
          categoryId: input.categoryId,
        });
      }

      const [category] = await productService.listProductCategories(
        { id: input.categoryId },
        {
          take: 1,
          withDeleted: true,
          select: ["id", "name", "handle"],
        }
      );

      if (!(category?.handle && category?.name)) {
        const durationMs = Date.now() - startedAt;
        consecutiveSyncFailures = 0;
        logger.warn(
          `[payload-sync] status=skip reason=missing_category_fields event=${input.eventName} category_id=${input.categoryId} duration_ms=${durationMs}`
        );
        return new StepResponse<SyncStepResult>({
          status: "missing",
          categoryId: input.categoryId,
        });
      }

      await payloadSyncService.upsertCategoryContent({
        medusaCategoryId: category.id,
        handle: category.handle,
        title: category.name,
        source: input.source || "medusa-event",
      });

      const durationMs = Date.now() - startedAt;
      consecutiveSyncFailures = 0;
      logger.info(
        `[payload-sync] status=success action=upsert event=${input.eventName} category_id=${category.id} handle=${category.handle} duration_ms=${durationMs}`
      );

      return new StepResponse<SyncStepResult>({
        status: "upserted",
        categoryId: category.id,
        handle: category.handle,
      });
    } catch (error) {
      consecutiveSyncFailures += 1;
      const alertThreshold = Number(process.env.PAYLOAD_SYNC_ALERT_THRESHOLD || "5");
      const durationMs = Date.now() - startedAt;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `[payload-sync] status=error event=${input.eventName} category_id=${input.categoryId} duration_ms=${durationMs} error_code=sync_failure error_message=${errorMessage}`
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

export const syncCategoryContentWorkflow = createWorkflow(
  "sync-category-content",
  (input: WorkflowInput) => {
    const result = syncCategoryContentStep(input);
    return new WorkflowResponse(result);
  }
);
