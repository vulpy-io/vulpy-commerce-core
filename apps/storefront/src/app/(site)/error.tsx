"use client";

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SiteError({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[SiteError]", error);
    }
  }, [error]);

  // Navigation events (NEXT_REDIRECT) are not errors — let Next.js redirect silently
  if (error.digest?.startsWith("NEXT_REDIRECT")) {
    return null;
  }

  return (
    <section className="overflow-hidden bg-surface-canvas py-20">
      <div className="mx-auto w-full max-w-[1170px] px-4 text-center sm:px-8 xl:px-0">
        <h1 className="h1 mb-4">
          Something went wrong
        </h1>
        <p className="mb-8 text-content-muted">
          We couldn&apos;t load this page. Please try again or head back home.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            className="inline-flex rounded-md bg-action-primary-background px-8 py-3 font-medium text-white hover:bg-action-primary-hover"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <Link
            className="inline-flex rounded-md border border-content-muted px-8 py-3 font-medium text-content-primary hover:bg-surface-subtle"
            href="/"
          >
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}