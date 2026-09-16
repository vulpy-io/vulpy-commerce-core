export type SelectionRouteEntry = {
  handle: string;
  route: string;
};

export function normalizePathname(pathname: string): string {
  return pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
}

export function matchSelectionHandle(
  pathname: string,
  routes: SelectionRouteEntry[]
): string | null {
  const normalizedPath = normalizePathname(pathname);

  for (const entry of routes) {
    if (entry.route === normalizedPath) {
      return entry.handle;
    }
  }

  return null;
}
