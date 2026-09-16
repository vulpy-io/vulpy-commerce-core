import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createUsersWorkflow } from "@medusajs/medusa/core-flows";
import {
  resolveMedusaAdminCredentials,
  upsertMedusaAdmin,
} from "./ensure-admin-core";

/**
 * Idempotent Medusa admin upsert from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Used by install and `pnpm vulpy user add|reset`.
 */
export default async function ensureAdmin({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { email, password } = resolveMedusaAdminCredentials();
  const userModule = container.resolve(Modules.USER);
  const authModule = container.resolve(Modules.AUTH);

  await upsertMedusaAdmin({
    email,
    password,
    logger,
    userModule,
    authModule,
    createUsers: async (input) => {
      const { result } = await createUsersWorkflow(container).run({ input });
      return { result };
    },
  });
}
