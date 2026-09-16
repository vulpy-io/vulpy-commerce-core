"use client"

import Link from "next/link"
import { useEffect } from "react"

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function CheckoutError({ error, reset }: Props) {
  // Log in development only; never in production
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[CheckoutError]", error)
    }
  }, [error])

  // Navigation events (NEXT_REDIRECT) are not errors — let Next.js redirect silently
  if (error.digest?.startsWith("NEXT_REDIRECT")) {
    return null
  }

  return (
    <div className="py-20 text-center">
      <h1 className="h1 mb-4">
        Something went wrong
      </h1>
      <p className="mb-8 text-content-muted">
        We couldn&apos;t complete your checkout. Your payment has not been
        charged.
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          className="inline-flex rounded-md bg-action-primary-background px-8 py-3 font-medium text-white"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link
          className="inline-flex rounded-md border border-content-muted px-8 py-3 font-medium"
          href="/cart"
        >
          Return to cart
        </Link>
      </div>
    </div>
  )
}
