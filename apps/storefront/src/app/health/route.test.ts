import { describe, expect, it } from "vitest";
import { dynamic, GET } from "./route";

describe("GET /health", () => {
  it("returns 200 with ok:true (probe gate contract)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("storefront");
  });

  it("is force-dynamic so proxies/load balancers never cache the probe", () => {
    // The route module must export `dynamic = "force-dynamic"` so the dev
    // wrapper's readiness probe always gets a live answer, never a cached
    // page. The module-level export is read directly from the route import.
    expect(dynamic).toBe("force-dynamic");
  });
});