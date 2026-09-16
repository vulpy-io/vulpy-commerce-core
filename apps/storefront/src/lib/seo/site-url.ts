const TRAILING_SLASH_PATTERN = /\/$/;

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000").replace(
    TRAILING_SLASH_PATTERN,
    ""
  );
}

export function toAbsoluteUrl(path: string, siteUrl = getSiteUrl()): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
