import { createRequire } from "node:module";
import path from "node:path";

// Medusa backend typechecks/builds as CommonJS, so import.meta is unavailable here.
// biome-ignore lint/correctness/noGlobalDirnameFilename: required for createRequire under CJS
const nodeRequire = createRequire(__filename);

const medusaDistRoot = path.join(
  path.dirname(nodeRequire.resolve("@medusajs/medusa/package.json")),
  "dist"
);

const productMiddlewares = nodeRequire(
  path.join(medusaDistRoot, "api/utils/middlewares/products/index.js")
) as {
  filterByValidSalesChannels: () => (
    req: unknown,
    res: unknown,
    next: () => void
  ) => Promise<void>;
  normalizeDataForContext: () => (
    req: unknown,
    res: unknown,
    next: () => void
  ) => Promise<void>;
  setPricingContext: () => (
    req: unknown,
    res: unknown,
    next: () => void
  ) => Promise<void>;
  setTaxContext: () => (
    req: unknown,
    res: unknown,
    next: () => void
  ) => Promise<void>;
  wrapVariantsWithInventoryQuantityForSalesChannel: (
    req: unknown,
    variants: unknown[]
  ) => Promise<void>;
  wrapVariantsWithTotalInventoryQuantity: (
    req: unknown,
    variants: unknown[]
  ) => Promise<void>;
};

const productHelpers = nodeRequire(
  path.join(medusaDistRoot, "api/store/products/helpers.js")
) as {
  wrapProductsWithTaxPrices: (req: unknown, products: unknown[]) => Promise<void>;
};

export const filterByValidSalesChannels = productMiddlewares.filterByValidSalesChannels;
export const normalizeDataForContext = productMiddlewares.normalizeDataForContext;
export const setPricingContext = productMiddlewares.setPricingContext;
export const setTaxContext = productMiddlewares.setTaxContext;
export const wrapVariantsWithInventoryQuantityForSalesChannel =
  productMiddlewares.wrapVariantsWithInventoryQuantityForSalesChannel;
export const wrapVariantsWithTotalInventoryQuantity =
  productMiddlewares.wrapVariantsWithTotalInventoryQuantity;
export const wrapProductsWithTaxPrices = productHelpers.wrapProductsWithTaxPrices;
