/**
 * Header height adapter — single source of truth for the fixed storefront
 * header's height via the CSS custom property `--header-height`.
 *
 * The `<header>` is `fixed top-0`, so every page must pad its first section
 * down below it. Instead of hand-placing px offsets per page, the header's
 *measured* height is written to `--header-height` on the document root and
 * consumed once at the layout level (and by scroll-anchor styling). The
 * measured value automatically tracks the header's sticky shrink (top bar
 * padding changes on scroll) and the desktop nav bar appearing at `xl`.
 */
export const HEADER_HEIGHT_CSS_VAR = "--header-height";

function nextFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(cb);
  }
  return window.setTimeout(cb, 16);
}

function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
  } else {
    window.clearTimeout(id);
  }
}

/**
 * Synchronously measures `header.offsetHeight` and writes it to the CSS var
 * on `root`. No-op when either element is missing.
 */
export function applyHeaderHeight(
  header: HTMLElement | null,
  root: HTMLElement | null,
  voidVar: string = HEADER_HEIGHT_CSS_VAR,
): void {
  if (!(header && root)) { return; }
  const height = header.getBoundingClientRect().height;
  root.style.setProperty(voidVar, `${height}px`);
}

/**
 * Watches `header` for size changes (sticky shrink, layout shift) and keeps
 * `--header-height` on `root` in sync. Returns a cleanup function, or `null`
 * when observation isn't possible (SSR / missing ResizeObserver).
 */
export function observeHeaderHeight(
  header: HTMLElement | null,
  root: HTMLElement | null,
  voidVar: string = HEADER_HEIGHT_CSS_VAR,
): (() => void) | null {
  if (!(header && root ) || typeof ResizeObserver === "undefined") {
    return null;
  }

  applyHeaderHeight(header, root, voidVar);

  let rafId: number | null = null;
  const observer = new ResizeObserver(() => {
    if (rafId !== null) { cancelFrame(rafId); }
    rafId = nextFrame(() => {
      rafId = null;
      applyHeaderHeight(header, root, voidVar);
    });
  });
  observer.observe(header);

  return () => {
    if (rafId !== null) { cancelFrame(rafId); }
    observer.disconnect();
  };
}