import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

function isMissingTableError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if (error.cause instanceof Error) {
      parts.push(error.cause.message);
    }
  } else {
    parts.push(String(error));
  }

  const text = parts.join(" ");
  return text.includes("does not exist") || text.includes("42P01");
}

async function ensurePayloadSchemaReady(): Promise<void> {
  const payload = await getPayload({ config });

  try {
    await payload.find({ collection: "media", limit: 1, overrideAccess: true });
    return;
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  if (payload.db.connect) {
    await payload.db.connect({ hotReload: false });
  }

  await payload.find({ collection: "media", limit: 1, overrideAccess: true });
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    await ensurePayloadSchemaReady();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[dev/ready]", error);
    return NextResponse.json({ error: message, ready: false }, { status: 503 });
  }
}
