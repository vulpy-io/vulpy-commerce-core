import Link from "next/link";

export default function NotFound() {
  return (
    <section className="overflow-hidden bg-gray-1 pt-[calc(var(--header-height)+5rem)] pb-20">
      <div className="mx-auto w-full max-w-[1170px] px-4 text-center sm:px-8 xl:px-0">
        <h1 className="h1 mb-4">
          Page not found
        </h1>
        <p className="mb-8 text-content-muted">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          className="inline-flex rounded-md bg-action-primary-background px-7 py-3 font-medium text-white hover:bg-action-primary-hover"
          href="/"
        >
          Back to home
        </Link>
      </div>
    </section>
  );
}
