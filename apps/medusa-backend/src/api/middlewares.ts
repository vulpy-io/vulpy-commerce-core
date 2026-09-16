import { defineMiddlewares } from "@medusajs/framework/http";
import { demoReadOnlyMiddlewares } from "./demo-read-only";
import { getPriceGuardMiddlewares } from "./store/price-guard";
import { quoteOrderMiddlewares } from "./store/quote/middlewares";
import { shopProductsMiddlewares } from "./store/shop/middlewares";

export default defineMiddlewares({
  routes: [
    ...demoReadOnlyMiddlewares,
    ...shopProductsMiddlewares,
    ...getPriceGuardMiddlewares(),
    ...quoteOrderMiddlewares,
  ],
});
