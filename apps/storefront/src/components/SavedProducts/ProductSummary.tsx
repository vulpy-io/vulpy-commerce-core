import Image from "next/image";
import Link from "next/link";

export default function ProductSummary({
  title,
  href,
  image,
  variantLabel,
  compact = false,
}: {
  title: string;
  href: string;
  image: string;
  variantLabel?: string;
  compact?: boolean;
}) {
  const imageSize = compact ? 56 : 80;

  return (
    <div className="flex min-w-0 items-center gap-3 sm:gap-5.5">
      <Link
        className={`flex shrink-0 items-center justify-center rounded-control bg-gray-2 ${
          compact ? "h-14 w-14" : "h-17.5 w-full max-w-[80px]"
        }`}
        href={href}
      >
        <Image alt={title} height={imageSize} src={image} width={imageSize} />
      </Link>
      <div className="min-w-0">
        <h3
          className={`text-content-primary duration-200 ease-out hover:text-content-brand ${
            compact ? "line-clamp-2 text-custom-sm" : ""
          }`}
        >
          <Link href={href}>{title}</Link>
        </h3>
        {variantLabel ? (
          <p className="mt-1 text-content-muted text-custom-sm">{variantLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
