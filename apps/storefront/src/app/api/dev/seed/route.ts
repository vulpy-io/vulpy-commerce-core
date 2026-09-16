import { NextResponse } from "next/server";
import { seedPayload } from "@/scripts/seed-payload-core";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    const { syncApiKey } = await seedPayload();
    return NextResponse.json({ ok: true, syncApiKey });
  } catch (error) {
    console.error("[dev/seed]", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
