import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const path = searchParams.get("path") || "/";

  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) {
    return NextResponse.json({ message: "Invalid preview secret" }, { status: 401 });
  }

  const draft = await draftMode();
  draft.enable();

  // Behind a reverse proxy, Next standalone builds request.url from its internal
  // bind address (0.0.0.0:3000), so redirect onto the canonical public origin.
  const base = process.env.NEXT_PUBLIC_SERVER_URL || new URL(request.url).origin;
  const requested = new URL(path, base);
  const safePath = `${requested.pathname}${requested.search}`;

  return NextResponse.redirect(new URL(safePath, base));
}
