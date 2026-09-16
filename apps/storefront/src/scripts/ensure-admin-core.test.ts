import { describe, expect, it, vi } from "vitest";
import {
  assertAdminCredentials,
  type PayloadAdminClient,
  resolveAdminCredentials,
  upsertPayloadAdmin,
} from "./ensure-admin-core";

const REQUIRED_RE = /required/;
const SHORT_PASSWORD_RE = /8 characters/;

describe("resolveAdminCredentials", () => {
  it("prefers PAYLOAD_SEED_* over ADMIN_*", () => {
    expect(
      resolveAdminCredentials({
        PAYLOAD_SEED_EMAIL: "a@example.com",
        PAYLOAD_SEED_PASSWORD: "password1",
        ADMIN_EMAIL: "b@example.com",
        ADMIN_PASSWORD: "password2",
      })
    ).toEqual({ email: "a@example.com", password: "password1" });
  });

  it("falls back to ADMIN_* and lowercases email", () => {
    expect(
      resolveAdminCredentials({
        ADMIN_EMAIL: "You@Example.COM",
        ADMIN_PASSWORD: "password1",
      })
    ).toEqual({ email: "you@example.com", password: "password1" });
  });
});

describe("assertAdminCredentials", () => {
  it("rejects missing values", () => {
    expect(() => assertAdminCredentials("", "password1")).toThrow(REQUIRED_RE);
    expect(() => assertAdminCredentials("a@b.com", "")).toThrow(REQUIRED_RE);
  });

  it("rejects short passwords", () => {
    expect(() => assertAdminCredentials("a@b.com", "short")).toThrow(
      SHORT_PASSWORD_RE
    );
  });

  it("accepts valid credentials", () => {
    expect(() => assertAdminCredentials("a@b.com", "password1")).not.toThrow();
  });
});

describe("upsertPayloadAdmin", () => {
  it("creates when no user exists", async () => {
    const create = vi.fn().mockResolvedValue({});
    const payload: PayloadAdminClient = {
      find: vi.fn().mockResolvedValue({ docs: [] }),
      update: vi.fn(),
      create,
    };

    await expect(
      upsertPayloadAdmin(payload, "a@example.com", "password1")
    ).resolves.toBe("created");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: "a@example.com", password: "password1" },
      })
    );
  });

  it("updates password when user exists", async () => {
    const update = vi.fn().mockResolvedValue({});
    const payload: PayloadAdminClient = {
      find: vi.fn().mockResolvedValue({ docs: [{ id: 7 }] }),
      update,
      create: vi.fn(),
    };

    await expect(
      upsertPayloadAdmin(payload, "a@example.com", "password1")
    ).resolves.toBe("updated");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        data: { password: "password1" },
      })
    );
  });

  it("validates before calling Payload", async () => {
    const payload: PayloadAdminClient = {
      find: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    };
    await expect(
      upsertPayloadAdmin(payload, "a@b.com", "short")
    ).rejects.toThrow(SHORT_PASSWORD_RE);
    expect(payload.find).not.toHaveBeenCalled();
  });
});
