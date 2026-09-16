/**
 * Pure Payload admin upsert — testable without booting Payload.
 */

export type PayloadAdminClient = {
  find: (args: {
    collection: "users";
    where: { email: { equals: string } };
    limit: number;
    overrideAccess: boolean;
  }) => Promise<{ docs: Array<{ id: number | string }> }>;
  update: (args: {
    collection: "users";
    id: number | string;
    data: { password: string };
    overrideAccess: boolean;
  }) => Promise<unknown>;
  create: (args: {
    collection: "users";
    data: { email: string; password: string };
    overrideAccess: boolean;
  }) => Promise<unknown>;
};

export function resolveAdminCredentials(env: NodeJS.ProcessEnv = process.env): {
  email: string;
  password: string;
} {
  const email = (env.PAYLOAD_SEED_EMAIL || env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = env.PAYLOAD_SEED_PASSWORD || env.ADMIN_PASSWORD || "";
  return { email, password };
}

export function assertAdminCredentials(email: string, password: string): void {
  if (!(email && password)) {
    throw new Error(
      "PAYLOAD_SEED_EMAIL and PAYLOAD_SEED_PASSWORD (or ADMIN_*) are required"
    );
  }
  if (password.length < 8) {
    throw new Error("Admin password must be at least 8 characters");
  }
}

export async function upsertPayloadAdmin(
  payload: PayloadAdminClient,
  email: string,
  password: string
): Promise<"created" | "updated"> {
  assertAdminCredentials(email, password);

  const existing = await payload.find({
    collection: "users",
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.docs.length) {
    await payload.update({
      collection: "users",
      id: existing.docs[0].id,
      data: { password },
      overrideAccess: true,
    });
    return "updated";
  }

  await payload.create({
    collection: "users",
    data: { email, password },
    overrideAccess: true,
  });
  return "created";
}
