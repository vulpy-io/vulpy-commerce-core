

const originalFetch = globalThis.fetch;

// Intercept: rewrite any 127.0.0.1 URL to host.docker.internal before calling
// the real fetch. This matches what dev-api-client.ts resolves from status.json.
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const rewritten = url.replace(/http:\/\/127\.0\.0\.1/g, "http://host.docker.internal");
  if (rewritten !== url) {
    console.log(`[seed-shim] ${url} → ${rewritten}`);
  }
  return originalFetch(rewritten, init);
}) as typeof globalThis.fetch;

// Now import and run the real seed.
await import("./src/scripts/seed-payload.js");