import path from "node:path";
import { postDevRoute, waitForPayloadReady } from "./dev-api-client";
import { upsertEnvVar } from "./upsert-env-var";

async function main() {
  await waitForPayloadReady();

  const result = (await postDevRoute("/api/dev/seed", "Seed")) as {
    syncApiKey?: string;
  };

  if (typeof result.syncApiKey === "string" && result.syncApiKey.trim()) {
    const medusaEnvPath = path.resolve(process.cwd(), "../medusa-backend/.env");
    upsertEnvVar(medusaEnvPath, "PAYLOAD_SYNC_API_KEY", result.syncApiKey.trim());
    console.log(`Updated PAYLOAD_SYNC_API_KEY in ${medusaEnvPath}`);
  }

  console.log("Payload seed complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
