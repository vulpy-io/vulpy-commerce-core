import { describe, expect, it, vi } from "vitest";
import {
  demoReadOnlyMiddleware,
  isDemoReadOnlyEnabled,
  isDemoReadOnlyWriteMethod,
} from "./demo-read-only";

describe("demo read-only gate", () => {
  it("defaults off unless explicitly enabled", () => {
    vi.stubEnv("VULPY_DEMO_READ_ONLY", "");
    vi.stubEnv("DEMO_READ_ONLY", "");
    expect(isDemoReadOnlyEnabled()).toBe(false);
  });

  it("accepts the explicit 1 flag and rejects falsey values", () => {
    vi.stubEnv("VULPY_DEMO_READ_ONLY", "1");
    expect(isDemoReadOnlyEnabled()).toBe(true);
    vi.stubEnv("VULPY_DEMO_READ_ONLY", "0");
    expect(isDemoReadOnlyEnabled()).toBe(false);
  });

  it("treats only mutation methods as writes", () => {
    expect(isDemoReadOnlyWriteMethod("GET")).toBe(false);
    expect(isDemoReadOnlyWriteMethod("POST")).toBe(true);
    expect(isDemoReadOnlyWriteMethod("PATCH")).toBe(true);
    expect(isDemoReadOnlyWriteMethod("DELETE")).toBe(true);
  });

  it("preserves reads and rejects writes with a controlled 403", async () => {
    vi.stubEnv("VULPY_DEMO_READ_ONLY", "1");
    const next = vi.fn();
    const read = await demoReadOnlyMiddleware(new Request("https://demo.test/shop", { method: "GET" }), next);
    expect(next).toHaveBeenCalledOnce();
    expect(read).toBeUndefined();

    const writeNext = vi.fn();
    const response = await demoReadOnlyMiddleware(
      new Request("https://demo.test/api/contact", { method: "POST" }),
      writeNext
    );
    expect(writeNext).not.toHaveBeenCalled();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "Demo is read-only" });
  });
});
