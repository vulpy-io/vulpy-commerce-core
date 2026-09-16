import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateTaxRegionsWorkflow } from "@medusajs/medusa/core-flows";

const SYSTEM_TAX_PROVIDER_ID = "tp_system";

export default async function fixTaxProviders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const taxModule = container.resolve(Modules.TAX);

  const taxRegions = await taxModule.listTaxRegions({});
  const toUpdate = taxRegions.filter((taxRegion) => !taxRegion.provider_id);

  if (toUpdate.length === 0) {
    logger.info("All tax regions already have a provider configured.");
    return;
  }

  await updateTaxRegionsWorkflow(container).run({
    input: toUpdate.map((taxRegion) => ({
      id: taxRegion.id,
      provider_id: SYSTEM_TAX_PROVIDER_ID,
    })),
  });

  for (const taxRegion of toUpdate) {
    logger.info(
      `Set tax provider for ${taxRegion.country_code} to ${SYSTEM_TAX_PROVIDER_ID}`
    );
  }

  logger.info(`Updated ${toUpdate.length} tax region(s).`);
}
