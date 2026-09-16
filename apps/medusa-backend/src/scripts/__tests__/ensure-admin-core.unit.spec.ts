import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  assertMedusaAdminCredentials,
  resolveMedusaAdminCredentials,
  upsertMedusaAdmin,
} from "../ensure-admin-core";

const REQUIRED_RE = /required/;
const SHORT_PASSWORD_RE = /8 characters/;
const NOPE_RE = /nope/;

describe("resolveMedusaAdminCredentials", () => {
  it("prefers ADMIN_* and lowercases email", () => {
    expect(
      resolveMedusaAdminCredentials({
        ADMIN_EMAIL: "You@Example.COM",
        ADMIN_PASSWORD: "password1",
        MEDUSA_ADMIN_EMAIL: "other@example.com",
      })
    ).toEqual({ email: "you@example.com", password: "password1" });
  });

  it("falls back to MEDUSA_ADMIN_*", () => {
    expect(
      resolveMedusaAdminCredentials({
        MEDUSA_ADMIN_EMAIL: "m@example.com",
        MEDUSA_ADMIN_PASSWORD: "password1",
      })
    ).toEqual({ email: "m@example.com", password: "password1" });
  });
});

describe("assertMedusaAdminCredentials", () => {
  it("rejects missing and short passwords", () => {
    expect(() => assertMedusaAdminCredentials("", "password1")).toThrow(
      REQUIRED_RE
    );
    expect(() => assertMedusaAdminCredentials("a@b.com", "short")).toThrow(
      SHORT_PASSWORD_RE
    );
  });
});

describe("upsertMedusaAdmin", () => {
  const logger = { info: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a user and links auth identity", async () => {
    const userModule = {
      listUsers: jest.fn().mockResolvedValue([]),
    };
    const authModule = {
      register: jest.fn().mockResolvedValue({
        success: true,
        authIdentity: { id: "auth_1", app_metadata: {} },
      }),
      updateAuthIdentities: jest.fn().mockResolvedValue([]),
      updateProvider: jest.fn(),
    };
    const createUsers = jest.fn().mockResolvedValue({
      result: [{ id: "user_1" }],
    });

    await expect(
      upsertMedusaAdmin({
        email: "a@example.com",
        password: "password1",
        logger,
        userModule,
        authModule,
        createUsers,
      })
    ).resolves.toBe("created");

    expect(createUsers).toHaveBeenCalled();
    expect(authModule.updateAuthIdentities).toHaveBeenCalledWith([
      {
        id: "auth_1",
        app_metadata: { user_id: "user_1" },
      },
    ]);
  });

  it("reuses an existing user and updates password when register fails", async () => {
    const userModule = {
      listUsers: jest.fn().mockResolvedValue([{ id: "user_1" }]),
    };
    const authModule = {
      register: jest.fn().mockResolvedValue({
        success: false,
        error: "Identity with email already exists",
      }),
      updateAuthIdentities: jest.fn(),
      updateProvider: jest.fn().mockResolvedValue({ success: true }),
    };

    await expect(
      upsertMedusaAdmin({
        email: "a@example.com",
        password: "password1",
        logger,
        userModule,
        authModule,
        createUsers: jest.fn(),
      })
    ).resolves.toBe("reused");

    expect(authModule.updateProvider).toHaveBeenCalledWith("emailpass", {
      email: "a@example.com",
      password: "password1",
      entity_id: "a@example.com",
    });
  });

  it("throws when updateProvider fails", async () => {
    const userModule = {
      listUsers: jest.fn().mockResolvedValue([{ id: "user_1" }]),
    };
    const authModule = {
      register: jest.fn().mockResolvedValue({ success: false }),
      updateAuthIdentities: jest.fn(),
      updateProvider: jest
        .fn()
        .mockResolvedValue({ success: false, error: "nope" }),
    };

    await expect(
      upsertMedusaAdmin({
        email: "a@example.com",
        password: "password1",
        logger,
        userModule,
        authModule,
        createUsers: jest.fn(),
      })
    ).rejects.toThrow(NOPE_RE);
  });

  it("validates credentials before touching modules", async () => {
    const userModule = { listUsers: jest.fn() };
    await expect(
      upsertMedusaAdmin({
        email: "a@example.com",
        password: "short",
        logger,
        userModule,
        authModule: {
          register: jest.fn(),
          updateAuthIdentities: jest.fn(),
          updateProvider: jest.fn(),
        },
        createUsers: jest.fn(),
      })
    ).rejects.toThrow(SHORT_PASSWORD_RE);
    expect(userModule.listUsers).not.toHaveBeenCalled();
  });
});
