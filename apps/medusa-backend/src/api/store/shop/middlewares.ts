import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import {
  authenticateOptionalCustomer,
  stripPricesForGuests,
} from "../price-guard";
import { isRequireLoginForPricesEnabled } from "../price-guard-config";

function ensureValidatedQuery(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  req.validatedQuery ??= {};
  next();
}

function shopCatalogMiddlewares(): MiddlewareRoute["middlewares"] {
  const chain: MiddlewareRoute["middlewares"] = [authenticateOptionalCustomer];

  if (isRequireLoginForPricesEnabled()) {
    chain.push(stripPricesForGuests);
  }

  chain.push(ensureValidatedQuery);
  return chain;
}

export const shopProductsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/shop/products",
    middlewares: shopCatalogMiddlewares(),
  },
  {
    method: ["GET"],
    matcher: "/store/shop/catalog",
    middlewares: shopCatalogMiddlewares(),
  },
];
