import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Health probe used by the dev wrapper and watchdog
 * (scripts/dev-app-server.sh, scripts/dev-watchdog-host.sh, Caddy
 * reachability checks). The storefront previously had NO /health route, so
 * every probe returned a 404 — which both failed the readiness gate AND
 * triggered the Next 16 dev 404 streaming path that throws
 * `controller[kState].transformAlgorithm is not a function` on Node 24
 * (the boot wedge). This trivial 200 stops the probe loop from touching the
 * 404 streaming code entirely.
 */
export function GET() {
  return NextResponse.json({ ok: true, service: "storefront" });
}