import { NextResponse } from "next/server";
import { getSelectionRoutes } from "@/lib/cms/selection-routes";

export const dynamic = "force-dynamic";

export async function GET() {
  const routes = await getSelectionRoutes();
  return NextResponse.json({ routes });
}
