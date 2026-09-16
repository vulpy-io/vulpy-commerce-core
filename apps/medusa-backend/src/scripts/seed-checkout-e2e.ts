import type { ExecArgs, IProductModuleService, IPromotionModuleService, ISalesChannelModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { ensureProduct, getOrCreateShippingProfile } from "./seed-helpers";

export const CHECKOUT_E2E_PRODUCT_HANDLE = "checkout-e2e-product";
export const CHECKOUT_E2E_VARIANT_SKU = "CHECKOUT-E2E-VARIANT";
export const CHECKOUT_E2E_PROMOTION_CODE = "CHECKOUT10";

export default async function seedCheckoutE2E({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const promotionModule = container.resolve<IPromotionModuleService>(Modules.PROMOTION);
  const salesChannelModule = container.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL);

  const [salesChannel] = await salesChannelModule.listSalesChannels({ name: "Default Sales Channel" });
  if (!salesChannel) {
    throw new Error("Checkout E2E fixture requires the default sales channel. Run the main seed first.");
  }

  const shippingProfile = await getOrCreateShippingProfile(container, logger, "Default");
  await ensureProduct(container, logger, CHECKOUT_E2E_PRODUCT_HANDLE, {
    title: "Checkout E2E Product",
    handle: CHECKOUT_E2E_PRODUCT_HANDLE,
    description: "Deterministic product reserved for the disposable checkout E2E stack.",
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: shippingProfile.id,
    options: [{ title: "Default option", values: ["Default"] }],
    variants: [
      {
        title: "Checkout E2E Variant",
        sku: CHECKOUT_E2E_VARIANT_SKU,
        options: { "Default option": "Default" },
        manage_inventory: false,
        prices: [{ amount: 20, currency_code: "usd" }],
      },
    ],
    sales_channels: [{ id: salesChannel.id }],
  });

  const [fixtureProduct] = await productModule.listProducts(
    { handle: CHECKOUT_E2E_PRODUCT_HANDLE },
    { relations: ["variants"] }
  );
  const fixtureVariant = fixtureProduct?.variants?.find(
    (variant) => variant.sku === CHECKOUT_E2E_VARIANT_SKU
  );
  if (!fixtureVariant) {
    throw new Error("Checkout E2E fixture variant was not created.");
  }

  const [promotion] = await promotionModule.listPromotions({
    code: CHECKOUT_E2E_PROMOTION_CODE,
  });
  if (promotion) {
    logger.info("Checkout E2E promotion already exists, reusing it.");
  } else {
    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: CHECKOUT_E2E_PROMOTION_CODE,
            type: "standard",
            status: "active",
            application_method: {
              type: "percentage",
              target_type: "items",
              allocation: "across",
              value: 10,
              currency_code: "usd",
              target_rules: [
                {
                  attribute: "items.product.id",
                  operator: "eq",
                  // fixtureProduct.id is resolved at creation time from the product
                  // returned by ensureProduct above. On a re-seeded database where the
                  // product was deleted and re-created, this would reference an orphaned id.
                  // In practice, ensureProduct skips creation if the handle already exists,
                  // so the product id is stable across re-runs on the same database.
                  values: [fixtureProduct.id],
                },
              ],
            },
          },
        ],
      },
    });
    logger.info("Checkout E2E promotion created.");
  }

  logger.info("Checkout E2E fixture is ready.");
}
