import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { linkSalesChannelsToApiKeyWorkflow } from "@medusajs/medusa/core-flows";

export default async function linkPublishableKey({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const apiKeyModule = container.resolve(Modules.API_KEY);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);

  const keys = await apiKeyModule.listApiKeys({ type: "publishable" });
  const active = keys.filter((key) => !key.revoked_at);
  const publishableKey =
    active.find((key) => key.title === "Webshop") ??
    active.find((key) => key.title === "Default Publishable API Key") ??
    active[0] ??
    keys[0];
  const [salesChannel] = await salesChannelModule.listSalesChannels({});

  if (!publishableKey) {
    throw new Error("No publishable API key found");
  }

  if (!salesChannel) {
    throw new Error("No sales channel found");
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableKey.id,
      add: [salesChannel.id],
    },
  });

  logger.info(
    `Linked publishable key "${publishableKey.title}" to sales channel "${salesChannel.name}"`
  );
}
