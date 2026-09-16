import type { Link } from "@medusajs/framework/modules-sdk";
import type {
  ExecArgs,
  IFulfillmentModuleService,
  IProductModuleService,
  ISalesChannelModuleService,
  IStoreModuleService,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/medusa";
import {
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { cleanupLegacyApparel } from "./cleanup-legacy-apparel";
import { seedLegacyApparelFixtures } from "./seed-apparel-fixtures";
import {
  ensureLink,
  ensureShippingOptions,
  ensureTaxRegions,
  getOrCreateFulfillmentSet,
  getOrCreatePublishableApiKey,
  getOrCreateRegion,
  getOrCreateShippingProfile,
  getOrCreateStockLocation,
  getSeedPaymentProviders,
  runIdempotentWorkflow,
} from "./seed-helpers";

export default async function seedDemoData({ container }: ExecArgs) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const remoteLink: Link = container.resolve(ContainerRegistrationKeys.LINK);
  const fulfillmentModuleService: IFulfillmentModuleService = container.resolve(
    Modules.FULFILLMENT
  );
  const salesChannelModuleService: ISalesChannelModuleService =
    container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService: IStoreModuleService = container.resolve(
    Modules.STORE
  );
  const productModuleService: IProductModuleService = container.resolve(
    Modules.PRODUCT
  );

  const countries = ["us"];

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // create the default sales channel
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: "Vulpy Commerce",
        supported_currencies: [
          {
            currency_code: "usd",
            is_default: true,
          },
        ],
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  const region = await getOrCreateRegion(container, logger, {
    name: "United States",
    currency_code: "usd",
    countries,
    payment_providers: getSeedPaymentProviders(),
  });
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await ensureTaxRegions(container, logger, countries);
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const stockLocation = await getOrCreateStockLocation(
    container,
    logger,
    "US Warehouse",
    {
      city: "San Francisco",
      country_code: "us",
      address_1: "123 Market Street",
      province: "CA",
      postal_code: "94105",
    }
  );

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: "Vulpy Commerce",
        default_location_id: stockLocation.id,
      },
    },
  });

  await ensureLink(
    remoteLink,
    logger,
    "Stock location ↔ manual fulfillment provider",
    {
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: "manual_manual",
      },
    }
  );

  logger.info("Seeding fulfillment data...");
  const shippingProfile = await getOrCreateShippingProfile(
    container,
    logger,
    "Default"
  );

  const fulfillmentSet = await getOrCreateFulfillmentSet(
    container,
    logger,
    fulfillmentModuleService,
    {
      name: "US Warehouse delivery",
      serviceZoneName: "United States",
      countryCodes: countries,
    }
  );

  await ensureLink(remoteLink, logger, "Stock location ↔ US fulfillment set", {
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await ensureShippingOptions(container, logger, [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Ship in 2-3 days.",
          code: "standard",
        },
        prices: [
          { currency_code: "usd", amount: 10 },
          { region_id: region.id, amount: 10 },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Express Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Ship in 24 hours.",
          code: "express",
        },
        prices: [
          { currency_code: "usd", amount: 15 },
          { region_id: region.id, amount: 15 },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ]);
  logger.info("Finished seeding fulfillment data.");

  await runIdempotentWorkflow(
    logger,
    "Sales channel ↔ stock location link",
    async () => {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
          id: stockLocation.id,
          add: [defaultSalesChannel[0].id],
        },
      });
    }
  );
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  const publishableApiKey = await getOrCreatePublishableApiKey(
    container,
    logger,
    "Webshop"
  );

  await runIdempotentWorkflow(
    logger,
    "Sales channel ↔ publishable API key link",
    async () => {
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: {
          id: publishableApiKey.id,
          add: [defaultSalesChannel[0].id],
        },
      });
    }
  );
  logger.info("Finished seeding publishable API key data.");

  // Minimal-core default seed keeps legacy apparel opt-in only.
  // Legacy NextMerce apparel fixtures remain opt-in.
  if (process.env.SEED_LEGACY_APPAREL === "1") {
    await seedLegacyApparelFixtures(container, logger, {
      shippingProfileId: shippingProfile.id,
      salesChannelId: defaultSalesChannel[0].id,
    });
  } else {
    await cleanupLegacyApparel(productModuleService, logger);
  }
}
