import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { resolveShopCatalog } from "../../../../modules/shopCatalog/shop-catalog-service";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const result = await resolveShopCatalog(req, req.query as Record<string, unknown>);

    const includeFacets =
      req.query.include_facets !== "0" && req.query.include_facets !== "false";
    res.setHeader(
      "Cache-Control",
      includeFacets
        ? "public, s-maxage=300, stale-while-revalidate=900"
        : "public, s-maxage=60, stale-while-revalidate=300"
    );
    res.json({
      products: result.products,
      count: result.count,
      offset: result.offset,
      limit: result.limit,
      sort: result.sort,
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
      `[shop/catalog] error=${message}`
    );
    res.status(500).json({
      message,
    });
  }
}
