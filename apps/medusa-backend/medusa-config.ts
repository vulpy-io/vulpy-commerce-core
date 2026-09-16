import path from "node:path";
import { defineConfig, loadEnv, Modules } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());
loadEnv(process.env.NODE_ENV || "development", path.resolve(process.cwd(), "../.."));

const useS3FileStorage = Boolean(
  process.env.S3_REGION && process.env.S3_BUCKET
);

function getAdminAllowedHosts(): string[] {
  // Suffix matches (leading ".") cover tunnels; Tailscale MagicDNS is *.ts.net.
  const hosts = new Set<string>([
    ".ngrok-free.dev",
    ".ngrok-free.app",
    ".ngrok.io",
    ".ts.net",
  ]);

  if (process.env.__MEDUSA_ADMIN_ADDITIONAL_ALLOWED_HOSTS) {
    for (const host of process.env.__MEDUSA_ADMIN_ADDITIONAL_ALLOWED_HOSTS.split(",")) {
      const trimmed = host.trim();
      if (trimmed) {
        hosts.add(trimmed);
      }
    }
  }

  if (process.env.MEDUSA_BACKEND_URL) {
    try {
      const hostname = new URL(process.env.MEDUSA_BACKEND_URL).hostname;
      if (hostname && !["localhost", "127.0.0.1"].includes(hostname)) {
        hosts.add(hostname);
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return Array.from(hosts);
}

function shouldDisableAdminHmr(): boolean {
  // Medusa Admin is often viewed through Fox Tailscale or the public edge.
  // In that topology Vite leaks its internal random websocket port to the
  // browser (for example wss://<magicdns>:40155/app), which is not exposed.
  // Disable Admin HMR by default; the admin still runs, just without hot reload.
  return process.env.MEDUSA_ADMIN_HMR !== "1";
}

export function getStripePaymentProviders(apiKey = process.env.STRIPE_API_KEY) {
  return apiKey
    ? [
        {
          resolve: "@medusajs/medusa/payment-stripe",
          id: "stripe",
          options: {
            apiKey,
          },
        },
      ]
    : [];
}

export default defineConfig({
  admin: {
    // Baked into the admin SPA at build time as __BACKEND_URL__.
    // Default: "/" → the SDK resolves API calls against the page's own origin.
    // That is correct in every access mode (Tailscale ts.net:9000, public edge
    // api.<domain>, loopback) because Medusa serves the admin itself — and it
    // avoids cross-origin preflights + partitioned localStorage in the WebUI
    // iframe. Only set VITE_MEDUSA_BACKEND_URL explicitly when the admin SPA
    // is hosted separately from the API. Do NOT fall back to MEDUSA_BACKEND_URL
    // here: that is the server-side URL (emails, links) and baking it into the
    // SPA forces the browser to call a foreign origin.
    backendUrl: process.env.VITE_MEDUSA_BACKEND_URL || "/",
    vite: () => ({
      server: {
        allowedHosts: getAdminAllowedHosts(),
        hmr: shouldDisableAdminHmr() ? false : undefined,
      },
    }),
  },
  featureFlags: {
    caching: true,
  },
  projectConfig: {
    redisUrl: process.env.REDIS_URL,
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS ?? "",
      adminCors: process.env.ADMIN_CORS ?? "",
      authCors: process.env.AUTH_CORS ?? "",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  modules: [
    {
      resolve: "./src/modules/payloadSync",
    },
    {
      resolve: "./src/modules/commerceReporting",
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      key: Modules.FULFILLMENT,
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
        ],
      },
    },
    {
      resolve: "@medusajs/file",
      key: Modules.FILE,
      options: {
        providers: useS3FileStorage
          ? [
              {
                resolve: "@medusajs/medusa/file-s3",
                id: "s3",
                options: {
                  authentication_method: "s3-iam-role",
                  file_url: process.env.S3_FILE_URL,
                  region: process.env.S3_REGION,
                  bucket: process.env.S3_BUCKET,
                  endpoint: process.env.S3_ENDPOINT,
                },
              },
            ]
          : [
              {
                resolve: "@medusajs/medusa/file-local",
                id: "local",
                options: {
                  backend_url: `${(
                    process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
                  ).replace(/\/$/, "")}/static`,
                },
              },
            ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      key: Modules.PAYMENT,
      options: {
        providers: getStripePaymentProviders(),
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: {
              channels: ["feed"],
            },
          },
        ],
      },
    },
  ],
});
