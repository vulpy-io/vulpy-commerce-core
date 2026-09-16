import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_BASE_URL = "http://localhost:3000";

// Dev seeds must hit the LOCAL storefront on its ACTUAL port. The dev app
// server writes .tmp/dev/status.json with shop_port (multi-store: NOT 3000).
function resolveBaseUrl(): string {
  try {
    const status = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../.tmp/dev/status.json"), "utf8")
    );
    if (status.shop_port) {
      // Host-reachable base: from the Hermes container 127.0.0.1 is the
      // container itself, not the host dev storefront. Use host.docker.internal
      // when present (Docker Desktop / bridge), fall back to 127.0.0.1 for
      // pure-host runs.
      const hostGateway = process.env.HERMES_CONTAINER_HOST_GATEWAY;
      const host = hostGateway || "127.0.0.1";
      return `http://${host}:${status.shop_port}`;
    }
  } catch {
    // no dev status yet — fall through
  }
  return process.env.NEXT_PUBLIC_SERVER_URL || DEFAULT_BASE_URL;
}

export async function postDevRoute(path: string, label: string) {
  const response = await fetch(`${resolveBaseUrl()}${path}`, { method: "POST" });

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `${label} failed (${response.status}): ${body || response.statusText}\n` +
        "Start the storefront dev server first:\n" +
        "  pnpm dev\n" +
        `Then run the ${label.toLowerCase()} command again.`
    );
    process.exit(1);
  }

  return response.json().catch(() => ({}));
}

export async function waitForPayloadReady(options?: {
  maxAttempts?: number;
  delayMs?: number;
}): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 90;
  const delayMs = options?.delayMs ?? 2000;
  const baseUrl = resolveBaseUrl();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/dev/ready`, { method: "POST" });
      if (response.ok) {
        return;
      }

      const body = await response.text();
      if (attempt === maxAttempts || attempt % 5 === 0) {
        console.log(
          `Waiting for Payload schema (${attempt}/${maxAttempts})… ${body || response.statusText}`
        );
      }
    } catch (error) {
      if (attempt === maxAttempts || attempt % 5 === 0) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`Waiting for storefront (${attempt}/${maxAttempts})… ${message}`);
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  console.error("Timed out waiting for Payload CMS schema. Check /tmp/storefront-reseed.log");
  process.exit(1);
}
