import config from "@payload-config";
import { unstable_cache } from "next/cache";
import { getPayload } from "payload";
import { normalizeSelectionRoute } from "@/lib/cms/pseudo-categories";
import {
  matchSelectionHandle,
  type SelectionRouteEntry,
} from "@/lib/cms/selection-route-match";

export type { SelectionRouteEntry };

async function loadSelectionRoutes(): Promise<SelectionRouteEntry[]> {
  const dbUrl = process.env.DATABASE_URI || process.env.PAYLOAD_DATABASE_URL;
  if (!dbUrl) {
    return [];
  }

  try {
    const payload = await getPayload({ config });
    const { docs } = await payload.find({
      collection: "categoryContent" as never,
      where: { kind: { equals: "selection" } },
      limit: 200,
      depth: 0,
    });

    return (docs as Array<{ handle?: string; route?: string }>)
      .map((doc) => {
        const handle = typeof doc.handle === "string" ? doc.handle : "";
        const route =
          typeof doc.route === "string" ? normalizeSelectionRoute(doc.route) : "";
        if (!(handle && route)) {
          return null;
        }
        return { handle, route };
      })
      .filter((entry): entry is SelectionRouteEntry => Boolean(entry));
  } catch {
    return [];
  }
}

export const getSelectionRoutes = unstable_cache(
  loadSelectionRoutes,
  ["selection-routes"],
  { tags: ["selection-routes"], revalidate: 300 }
);

export async function getSelectionHandleForPath(pathname: string): Promise<string | null> {
  const routes = await getSelectionRoutes();
  return matchSelectionHandle(pathname, routes);
}
