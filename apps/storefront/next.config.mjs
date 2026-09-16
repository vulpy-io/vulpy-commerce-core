import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { withPayload } from "@payloadcms/next/withPayload";

const { loadEnvConfig } = nextEnv;

const storefrontDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(storefrontDir, "../..");

// Shop-wide flags: loadEnvConfig fills vars NOT already set, first call wins.
// Root `.env` fills gaps; app `.env` is the reliable source for dev (verified
// 2026-08-11: root `.env` alone did not reach the turbo dev compile).
loadEnvConfig(rootDir);
loadEnvConfig(storefrontDir);

const isDev = process.env.NODE_ENV === "development";

// External hostnames allowed to reach the dev server (comma-separated), e.g.
// tailnet or dev-zone preview hosts set up by the installer.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Always pass the array (possibly empty). Conditional spread can leave Next's
  // blockCrossSiteDEV with `undefined` if env loads after first config snapshot.
  allowedDevOrigins,
  env: {
    REQUIRE_LOGIN_FOR_PRICES: process.env.REQUIRE_LOGIN_FOR_PRICES ?? "false",
    PRICE_GATE_MODE: process.env.PRICE_GATE_MODE ?? "off",
  },
  images: {
    dangerouslyAllowLocalIP: isDev,
    localPatterns: [
      {
        pathname: "/api/media/**",
        // Omit search so ?v=<updatedAt> cache-busting works for CMS uploads.
      },
      {
        pathname: "/images/**",
        search: "",
      },
    ],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/api/media/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withPayload(nextConfig);
