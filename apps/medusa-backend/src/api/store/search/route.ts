import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { searchProducts } from "../../../modules/productSearch";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseLimit(value: unknown) {
  const parsed = Number.parseInt(toTrimmedString(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: unknown) {
  const parsed = Number.parseInt(toTrimmedString(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseCategoryIds(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  return undefined;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const q = toTrimmedString(req.query.q);
  const regionId = toTrimmedString(req.query.region_id);
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const categoryIds = parseCategoryIds(req.query.category_id);

  if (!regionId) {
    res.status(400).json({
      message: "region_id query parameter is required",
    });
    return;
  }

  try {
    const result = await searchProducts(req, {
      term: q,
      limit,
      offset,
      categoryIds,
      regionId,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `[store/search] q="${q}" region_id=${regionId} offset=${offset} limit=${limit} error=${message}`
    );
    res.status(400).json({
      message,
    });
  }
}
