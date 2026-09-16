"use client";

import { useEffect } from "react";
import { observeHeaderHeight } from "@/lib/header-height";

/**
 * Syncs the fixed `<header>` element's measured height to the `--header-height`
 * CSS variable on the document root as the single source of truth for page
 * top-offset (scroll padding, sticky rails, mobile menu top, breadcrumbs).
 *
 * Mounted inside the site layout (client tree) where `<header>` is rendered.
 * Observes with ResizeObserver so the sticky-shrink height change and the
 * desktop nav bar appearing at `xl` keep the offset in sync. No-op during SSR.
 */
export function HeaderHeightSync() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header");
    const root = document.documentElement;
    if (!(header && root)) { return; }

    const cleanup = observeHeaderHeight(header, root);
    return () => cleanup?.();
  }, []);

  return null;
}

export default HeaderHeightSync;