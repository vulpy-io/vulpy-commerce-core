import { postDevRoute } from "./dev-api-client";

async function main() {
  const result = await postDevRoute("/api/dev/generate", "Generate");
  console.log(
    `Payload codegen complete: ${(result as { generated?: string[] }).generated?.join(", ") ?? "ok"}`
  );
}

main().catch((error) => {
  console.error(
    `${error instanceof Error ? error.message : error}\n` +
      "Start the storefront dev server first:\n" +
      "  pnpm dev"
  );
  process.exit(1);
});
