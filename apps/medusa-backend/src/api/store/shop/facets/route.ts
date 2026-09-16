import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { resolveShopFacets } from "../../../../modules/shopCatalog/shop-catalog-service";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const result = await resolveShopFacets(req, req.query as Record<string, unknown>);

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=1800, stale-while-revalidate=3600"
    );
    res.json({
      facets: result.facets,
      product_category_ids: result.productCategoryIds,
      products_index: result.productsIndex,
    });
  } catch (error) {
    if (error instanceof MedusaError) {
      res.status(400).json({
        type: error.type,
        message: error.message,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(
      `[shop/facets] error=${message}`
    );
    res.status(500).json({
      message,
    });
  }
}
