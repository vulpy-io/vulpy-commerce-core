import { NextResponse } from "next/server";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isDemoReadOnlyEnabled(): boolean {
  return process.env.VULPY_DEMO_READ_ONLY === "1" || process.env.DEMO_READ_ONLY === "1";
}

export function isDemoReadOnlyWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

export function demoReadOnlyMiddleware(
  request: Request,
  next: () => unknown | Promise<unknown>
): Response | undefined {
  if (isDemoReadOnlyEnabled() && isDemoReadOnlyWriteMethod(request.method)) {
    return NextResponse.json({ error: "Demo is read-only" }, { status: 403 });
  }

  next();
  return undefined;
}
