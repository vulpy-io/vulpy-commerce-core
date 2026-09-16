import fs from "node:fs";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

const DEFAULT_STOREFRONT_ENV_PATH = path.resolve(
  process.cwd(),
  "../storefront/.env"
);

const PREFERRED_TITLES = ["Webshop", "Default Publishable API Key"];

function resolveTargetEnvPath(): string {
  const deployEnv = process.env.DEPLOY_ENV_FILE?.trim();
  if (deployEnv) {
    return path.resolve(deployEnv);
  }

  return DEFAULT_STOREFRONT_ENV_PATH;
}

function upsertEnvVar(filePath: string, key: string, value: string): void {
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}${content ? "\n" : ""}${line}\n`;

  fs.writeFileSync(filePath, next);
}

export default async function printPublishableKey({
  container,
  args = [],
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const apiKeyModule = container.resolve(Modules.API_KEY);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const publishableKeys = await apiKeyModule.listApiKeys({
    type: "publishable",
  });

  const activeKeys = publishableKeys.filter((key) => !key.revoked_at);
  let activeKey =
    activeKeys.find((key) =>
      PREFERRED_TITLES.some(
        (title) => key.title?.toLowerCase() === title.toLowerCase()
      )
    ) ??
    activeKeys[0] ??
    publishableKeys[0];

  if (!activeKey?.token) {
    throw new Error(
      "No publishable API key found. Run seed first: pnpm --filter @apps/medusa-backend seed"
    );
  }

  // Prefer a key that already has a sales-channel link when multiple exist.
  for (const candidate of activeKeys.length ? activeKeys : [activeKey]) {
    try {
      const { data } = await query.graph({
        entity: "api_key",
        fields: ["id", "sales_channels.id"],
        filters: { id: candidate.id },
      });
      const row = data?.[0] as
        | { sales_channels?: Array<{ id: string }> }
        | undefined;
      if (row?.sales_channels?.length) {
        activeKey = candidate;
        break;
      }
    } catch {
      // Query shape can vary; fall through to title preference.
    }
  }

  const writeEnv = args.includes("write-env");

  logger.info(
    `Publishable API key "${activeKey.title}" (${activeKey.id}):\n${activeKey.token}`
  );

  if (writeEnv) {
    // Refuse to write an unlinked key when we can detect the link state.
    try {
      const { data } = await query.graph({
        entity: "api_key",
        fields: ["id", "sales_channels.id"],
        filters: { id: activeKey.id },
      });
      const row = data?.[0] as
        | { sales_channels?: Array<{ id: string }> }
        | undefined;
      if (row && (!row.sales_channels || row.sales_channels.length === 0)) {
        throw new Error(
          `Publishable key "${activeKey.title}" has no sales channel. Run: pnpm --filter @apps/medusa-backend exec medusa exec ./src/scripts/link-publishable-key.ts`
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("no sales channel")
      ) {
        throw error;
      }
    }

    const targetPath = resolveTargetEnvPath();
    upsertEnvVar(targetPath, "MEDUSA_PUBLISHABLE_KEY", activeKey.token);
    logger.info(`Updated ${targetPath}`);
  }
}
