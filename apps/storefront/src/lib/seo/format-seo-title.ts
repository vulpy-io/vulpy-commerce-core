const SITE_NAME_SUFFIX = " | ";

export function formatSeoTitle(title: string, siteName: string): string {
  const trimmedTitle = title.trim();
  const trimmedSiteName = siteName.trim();

  if (!trimmedSiteName) {
    return trimmedTitle;
  }

  if (!trimmedTitle) {
    return trimmedSiteName;
  }

  if (trimmedTitle === trimmedSiteName) {
    return trimmedTitle;
  }

  const suffix = `${SITE_NAME_SUFFIX}${trimmedSiteName}`;
  if (trimmedTitle.endsWith(suffix)) {
    return trimmedTitle;
  }

  return `${trimmedTitle}${suffix}`;
}
