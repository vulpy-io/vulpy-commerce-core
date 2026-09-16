const DEFAULT_LOGO = "/images/logo/logo.svg";
const SVG_LOGO_PATTERN = /\.svg($|\?)/i;

export const HEADER_LOGO_WIDTH = 150;
/** Default logo aspect ratio (1291×369). */
export const HEADER_LOGO_HEIGHT = Math.round(HEADER_LOGO_WIDTH * (369 / 1291));

/**
 * The Vulpy Commerce wordmark is dark-on-light and works on both the light
 * header and footer surfaces. Custom CMS logos are returned unchanged.
 */
export function headerLogoUrl(logoUrl: string): string {
  const normalizedLogoUrl = logoUrl.trim();
  if (
    !normalizedLogoUrl ||
    normalizedLogoUrl === DEFAULT_LOGO ||
    normalizedLogoUrl.endsWith("/images/logo/logo.svg")
  ) {
    return DEFAULT_LOGO;
  }
  return normalizedLogoUrl;
}

export function isSvgLogo(url: string): boolean {
  return SVG_LOGO_PATTERN.test(url);
}
