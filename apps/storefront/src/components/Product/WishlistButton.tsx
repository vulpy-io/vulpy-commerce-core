function HeartIcon({ filled, size = 24 }: { filled: boolean; size?: number }) {
  return (
    <svg
      className={filled ? "fill-content-muted stroke-content-muted" : ""}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

export default function WishlistButton({
  filled,
  onClick,
  variant = "icon",
  className = "",
  disabled = false,
}: {
  filled: boolean;
  onClick: () => void;
  variant?: "icon" | "text" | "card";
  className?: string;
  disabled?: boolean;
}) {
  if (variant === "text") {
    return (
      <button
        className={`inline-flex items-center gap-2 rounded-md bg-surface-inverse px-6 py-3 font-semibold text-white duration-200 ease-out hover:bg-surface-inverse/90 disabled:opacity-50 ${className}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <HeartIcon filled={filled} />
        {filled ? "Remove from wishlist" : "Add to wishlist"}
      </button>
    );
  }

  if (variant === "card") {
    return (
      <button
        aria-label={filled ? "Remove from wishlist" : "Add to wishlist"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-white text-content-primary shadow-1 duration-200 ease-out hover:text-content-brand disabled:opacity-50 ${className}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <HeartIcon filled={filled} size={20} />
      </button>
    );
  }

  return (
    <button
      aria-label={filled ? "Remove from wishlist" : "Add to wishlist"}
      className={`flex h-12 w-12 items-center justify-center rounded-md border border-gray-3 duration-200 ease-out hover:border-transparent hover:bg-surface-inverse hover:text-white disabled:opacity-50 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <HeartIcon filled={filled} />
    </button>
  );
}