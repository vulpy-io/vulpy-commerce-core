import { describe, expect, it, vi } from "vitest";
import { demoAdminOnly, publicRead } from "./index";

describe("Payload demo read-only access", () => {
  it("keeps public reads available", () => {
    expect(publicRead({} as never)).toBe(true);
  });

  it("blocks admin writes while preserving authenticated access when disabled", () => {
    vi.stubEnv("VULPY_DEMO_READ_ONLY", "1");
    expect(demoAdminOnly({ req: { user: { id: "user_1" } } } as never)).toBe(false);
    vi.stubEnv("VULPY_DEMO_READ_ONLY", "0");
    expect(demoAdminOnly({ req: { user: { id: "user_1" } } } as never)).toBe(true);
  });
});
