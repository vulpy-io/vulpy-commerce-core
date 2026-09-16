/**
 * Helper predicates for the shop catalog infinite-scroll hook.
 *
 * `loadedPage` tells which page the currently rendered products actually reach
 * (1 when the server rendered page 1 and the client appended nothing; N when
 * the user landed on / scrolled to page N). The dedupe flag is true when the
 * user opened a deep ?page=N URL so the hook must skip products the server
 * already rendered.
 */

export type PageGuestGuard = {
  isDedupeActive: boolean;
  isDeepLanding: boolean;
  isInterceptorDedupeActive: boolean;
  hasAppended: boolean;
};

/** True when the client hook must suppress a server-rendered deep page's products. */
export function isDeepPageDedupeActive(
  scope: Pick<PageGuestGuard, "isDedupeActive" | "isDeepLanding"> & {
    isInterceptorDedupeActive?: boolean;
    hasAppended?: boolean;
  }
): boolean {
  return Boolean(
    scope.isDedupeActive &&
      (scope.isDeepLanding || scope.isInterceptorDedupeActive || scope.hasAppended)
  );
}

/** True when the hook may append the next page. */
export function shouldAppendNextPage(
  scope: Pick<PageGuestGuard, "isDedupeActive"> & {
    loadedPage?: number;
    totalPages?: number;
  }
): boolean {
  if (!scope.isDedupeActive) {
    return true;
  }
  return (scope.loadedPage ?? 1) < (scope.totalPages ?? 1);
}