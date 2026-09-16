"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const STALE_NAVIGATION_MS = 10_000;

function isInternalNavigationLink(anchor: HTMLAnchorElement): boolean {
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return false;
  }

  const href = anchor.getAttribute("href");
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return false;
  }

  try {
    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.origin !== window.location.origin) {
      return false;
    }

    const current = `${window.location.pathname}${window.location.search}`;
    const next = `${nextUrl.pathname}${nextUrl.search}`;
    return next !== current;
  } catch {
    return false;
  }
}

export function handleNavigationClick(
  event: MouseEvent,
  startProgress: () => void,
): void {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const anchor = target.closest("a");
  if (
    !((anchor instanceof HTMLAnchorElement) &&
      isInternalNavigationLink(anchor)) ||
    event.defaultPrevented
  ) {
    return;
  }

  startProgress();
}

export function registerNavigationClickListener(
  target: Document,
  handleClick: (event: MouseEvent) => void,
): () => void {
  target.addEventListener("click", handleClick, true);
  return () => target.removeEventListener("click", handleClick, true);
}

export default function TopLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigatingRef = useRef(false);
  const isFirstRouteRef = useRef(true);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (staleNavTimerRef.current) {
      clearTimeout(staleNavTimerRef.current);
      staleNavTimerRef.current = null;
    }
  }, []);

  const completeProgress = useCallback(() => {
    clearTimers();
    isNavigatingRef.current = false;
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
  }, [clearTimers]);

  const startProgress = useCallback(() => {
    clearTimers();
    isNavigatingRef.current = true;
    setVisible(true);
    setProgress(18);

    timerRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }
        return current + Math.random() * 10;
      });
    }, 160);

    staleNavTimerRef.current = setTimeout(() => {
      if (isNavigatingRef.current) {
        completeProgress();
      }
    }, STALE_NAVIGATION_MS);
  }, [clearTimers, completeProgress]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) =>
      handleNavigationClick(event, startProgress);

    return registerNavigationClickListener(document, handleClick);
  }, [startProgress]);

  useEffect(() => {
    if (isFirstRouteRef.current) {
      isFirstRouteRef.current = false;
      return;
    }

    if (!isNavigatingRef.current) {
      startProgress();
    }
    completeProgress();
  }, [routeKey, startProgress, completeProgress]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-999999 h-1 w-full bg-transparent"
    >
      <div
        className="h-full bg-action-primary-background shadow-[0_1px_4px_rgba(60,80,224,0.45)] transition-[width] duration-200 ease-out"
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}
