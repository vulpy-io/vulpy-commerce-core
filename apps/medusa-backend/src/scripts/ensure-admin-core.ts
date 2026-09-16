/**
 * Pure Medusa admin upsert logic — testable with mocked modules.
 */

export interface EnsureAdminLogger {
  info: (message: string) => void;
}

export interface EnsureAdminUserModule {
  listUsers: (selector: { email: string }) => Promise<Array<{ id: string }>>;
}

export interface EnsureAdminAuthModule {
  register: (
    provider: string,
    data: { body: { email: string; password: string } }
  ) => Promise<{
    success: boolean;
    authIdentity?: {
      id: string;
      app_metadata?: Record<string, unknown> | null;
    };
    error?: string;
  }>;
  updateAuthIdentities: (
    data: Array<{ id: string; app_metadata: Record<string, unknown> }>
  ) => Promise<unknown>;
  updateProvider: (
    provider: string,
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string }>;
}

export type CreateUsersRunner = (input: {
  users: Array<{ email: string }>;
}) => Promise<{ result: Array<{ id?: string }> }>;

export function resolveMedusaAdminCredentials(
  env: NodeJS.ProcessEnv = process.env
): { email: string; password: string } {
  const email = (env.ADMIN_EMAIL || env.MEDUSA_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = env.ADMIN_PASSWORD || env.MEDUSA_ADMIN_PASSWORD || "";
  return { email, password };
}

export function assertMedusaAdminCredentials(
  email: string,
  password: string
): void {
  if (!(email && password)) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD (or MEDUSA_ADMIN_*) are required"
    );
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }
}

export async function upsertMedusaAdmin(args: {
  email: string;
  password: string;
  logger: EnsureAdminLogger;
  userModule: EnsureAdminUserModule;
  authModule: EnsureAdminAuthModule;
  createUsers: CreateUsersRunner;
}): Promise<"created" | "reused"> {
  const { email, password, logger, userModule, authModule, createUsers } = args;
  assertMedusaAdminCredentials(email, password);

  const existing = await userModule.listUsers({ email });
  let userId = existing[0]?.id;
  let outcome: "created" | "reused" = "reused";

  if (userId) {
    logger.info(`Reusing Medusa admin ${email}`);
  } else {
    const { result } = await createUsers({ users: [{ email }] });
    const createdId = result[0]?.id;
    if (!createdId) {
      throw new Error(`Failed to create Medusa admin user ${email}`);
    }
    userId = createdId;
    logger.info(`Created Medusa admin ${email}`);
    outcome = "created";
  }

  const registered = await authModule.register("emailpass", {
    body: { email, password },
  });

  if (registered.success && registered.authIdentity?.id) {
    const authIdentityId = registered.authIdentity.id;
    const appMetadata = (registered.authIdentity.app_metadata ?? {}) as Record<
      string,
      unknown
    >;
    if (appMetadata.user_id !== userId) {
      await authModule.updateAuthIdentities([
        {
          id: authIdentityId,
          app_metadata: { ...appMetadata, user_id: userId },
        },
      ]);
    }
  } else {
    const updated = await authModule.updateProvider("emailpass", {
      email,
      password,
      entity_id: email,
    });
    if (!updated.success) {
      throw new Error(
        updated.error || `Failed to update password for Medusa admin ${email}`
      );
    }
    logger.info(`Updated Medusa admin password for ${email}`);
  }

  return outcome;
}
