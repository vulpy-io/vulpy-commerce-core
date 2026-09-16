type MediaLike = {
  url?: string | null;
  alt?: string | null;
  updatedAt?: string | null;
} | string | null | undefined;

export function getMediaUrl(media: MediaLike, fallback = ""): string {
  if (!media) { return fallback; }
  if (typeof media === "string") { return media; }
  const url = media.url || fallback;
  if (!(url && media.updatedAt)) { return url; }
  const version = encodeURIComponent(media.updatedAt);
  return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

export function getMediaAlt(media: MediaLike, fallback = ""): string {
  if (!media || typeof media === "string") { return fallback; }
  return media.alt?.trim() || fallback;
}
