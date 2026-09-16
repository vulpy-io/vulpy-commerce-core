export type ExternalVideoProvider = "youtube" | "vimeo";

const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
] as const;

const VIMEO_ID_PATTERN = /vimeo\.com\/(?:video\/)?(\d+)/;

function extractYouTubeId(url: string): string | null {
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(VIMEO_ID_PATTERN);
  return match?.[1] ?? null;
}

export function buildExternalVideoEmbedUrl(
  provider: ExternalVideoProvider,
  url: string,
  autoplay = false,
): string | null {
  if (provider === "youtube") {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return null;
    }

    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
    });
    if (autoplay) {
      params.set("autoplay", "1");
      params.set("mute", "1");
      params.set("playsinline", "1");
    }

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }

  const videoId = extractVimeoId(url);
  if (!videoId) {
    return null;
  }

  const params = new URLSearchParams({
    title: "0",
    byline: "0",
    portrait: "0",
  });
  if (autoplay) {
    params.set("autoplay", "1");
    params.set("muted", "1");
  }

  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}
