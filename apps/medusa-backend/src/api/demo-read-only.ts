import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEMO_CART_PATH = /^\/store\/carts(?:\/[^/]+\/line-items(?:\/[^/]+)?)?\/?$/;

export function isDemoCartWriteAllowed(method: string, url: string): boolean {
  if (!isDemoReadOnlyWriteMethod(method)) { return false; }
  let pathname = url;
  try { pathname = new URL(url, "http://localhost").pathname; } catch { /* use raw path */ }
  return DEMO_CART_PATH.test(pathname);
}
export function isDemoReadOnlyEnabled(): boolean {
  const value =
    process.env.VULPY_DEMO_READ_ONLY?.trim() ||
    process.env.DEMO_READ_ONLY?.trim() ||
    "0";
  return ["1", "true", "yes", "on"].includes(value);
}

export function isDemoReadOnlyWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

export function demoReadOnlyMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void {
  if (isDemoReadOnlyEnabled() && isDemoReadOnlyWriteMethod(req.method) && !isDemoCartWriteAllowed(req.method, req.url)) {
    res.status(403).json({ error: "Demo is read-only" });
    return;
  }
  next();
}

export const demoReadOnlyMiddlewares: MiddlewareRoute[] = [
  { method: ["POST", "PUT", "PATCH", "DELETE"], matcher: "/admin/*", middlewares: [demoReadOnlyMiddleware] },
  { method: ["POST", "PUT", "PATCH", "DELETE"], matcher: "/store/*", middlewares: [demoReadOnlyMiddleware] },
];
