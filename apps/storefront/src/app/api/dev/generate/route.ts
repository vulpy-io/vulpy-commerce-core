import config from "@payload-config";
import { NextResponse } from "next/server";
import { generateImportMap, getPayload } from "payload";
import { generateTypes } from "payload/node";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const payload = await getPayload({ config });
  await generateTypes(payload.config, { log: false });
  await generateImportMap(payload.config, { log: false });

  return NextResponse.json({ ok: true, generated: ["payload-types.ts", "importMap.js"] });
}
