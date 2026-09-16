"use client";

import { useEffect } from "react";
import "@/app/css/style.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  // Navigation events (NEXT_REDIRECT) are not errors — let Next.js redirect silently
  if (error.digest?.startsWith("NEXT_REDIRECT")) {
    return null;
  }

  return (
    <html lang="en">
      <body>
        <section className="flex min-h-screen items-center justify-center bg-surface-canvas px-4">
          <div className="mx-auto w-full max-w-lg text-center">
            {/* Fox-in-the-Box branding */}
            <div className="mb-8 flex items-center justify-center gap-3">
              <img
                alt="Fox in the Box"
                className="h-12 w-auto"
                height={43}
                src="/images/logo/logo.svg"
                width={150}
              />
              <span className="font-semibold text-content-primary text-xl tracking-tight">
                Fox in the Box
              </span>
            </div>

            <h1 className="h1 mb-4">
              Something went wrong
            </h1>

            <p className="mb-8 text-content-muted">
              We encountered an unexpected error. Please try again or come back
              later.
            </p>

            <button
              className="inline-flex rounded-md bg-action-primary-background px-8 py-3 font-medium text-white hover:bg-action-primary-hover"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
          </div>
        </section>
      </body>
    </html>
  );
}