import {
  demoReadOnlyMiddleware,
  demoReadOnlyMiddlewares,
  isDemoCartWriteAllowed,
  isDemoReadOnlyEnabled,
} from "../demo-read-only";
import middlewares from "../middlewares";

describe("Medusa demo read-only middleware", () => {
  it("defaults off and accepts the explicit flag", () => {
    process.env.VULPY_DEMO_READ_ONLY = "";
    process.env.DEMO_READ_ONLY = "";
    expect(isDemoReadOnlyEnabled()).toBe(false);
    process.env.DEMO_READ_ONLY = "1";
    expect(isDemoReadOnlyEnabled()).toBe(true);
  });

  it("registers the demo read-only routes before the other API routes", () => {
    const routes = (middlewares as { routes: Array<{ matcher: string; middlewares: unknown[] }> }).routes;
    expect(routes.slice(0, demoReadOnlyMiddlewares.length).map((route) => route.matcher)).toEqual([
      "/admin/*",
      "/store/*",
    ]);
    expect(
      routes
        .slice(0, demoReadOnlyMiddlewares.length)
        .every((route) => route.middlewares.includes(demoReadOnlyMiddleware))
    ).toBe(true);
  });

  it("passes reads and cart writes, but rejects checkout and admin writes", () => {
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    process.env.VULPY_DEMO_READ_ONLY = "1";
    demoReadOnlyMiddleware({ method: "GET", url: "/store/carts/cart_1" } as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);

    const cartNext = jest.fn();
    demoReadOnlyMiddleware({ method: "POST", url: "/store/carts" } as never, res as never, cartNext);
    expect(cartNext).toHaveBeenCalledTimes(1);

    const lineItemNext = jest.fn();
    demoReadOnlyMiddleware(
      { method: "POST", url: "/store/carts/cart_1/line-items" } as never,
      res as never,
      lineItemNext
    );
    expect(lineItemNext).toHaveBeenCalledTimes(1);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const writeNext = jest.fn();
      demoReadOnlyMiddleware({ method, url: "/store/carts/cart_1/complete" } as never, res as never, writeNext);
      expect(writeNext).not.toHaveBeenCalled();
    }
    const adminNext = jest.fn();
    demoReadOnlyMiddleware({ method: "POST", url: "/admin/products" } as never, res as never, adminNext);
    expect(adminNext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows cart and line-item mutations but blocks checkout/payment", () => {
    process.env.VULPY_DEMO_READ_ONLY = "1";
    expect(isDemoCartWriteAllowed("POST", "/store/carts")).toBe(true);
    expect(isDemoCartWriteAllowed("POST", "/store/carts/cart_1/line-items")).toBe(true);
    expect(isDemoCartWriteAllowed("DELETE", "/store/carts/cart_1/line-items/item_1")).toBe(true);
    expect(isDemoCartWriteAllowed("POST", "/store/carts/cart_1/complete")).toBe(false);
    expect(isDemoCartWriteAllowed("POST", "/store/payment-collections")).toBe(false);
  });
});
