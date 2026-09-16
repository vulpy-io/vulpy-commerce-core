type NavActiveIndicatorProps = {
  visible: boolean;
  position: "left" | "right";
  hoverGroup?: "group" | "group/sub";
  mobileFit?: boolean;
  /** `underline` (default) for main-nav links; `dot` for dropdown sub-items. */
  variant?: "dot" | "underline";
};

export function NavActiveIndicator({
  visible,
  position,
  hoverGroup = "group",
  mobileFit = false,
  variant = "underline",
}: NavActiveIndicatorProps) {
  const hoverClass =
    hoverGroup === "group/sub" ? "group-hover/sub:opacity-100" : "group-hover:opacity-100";

  if (variant === "dot") {
    return (
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 transition-opacity duration-200 ${
          position === "left" ? "left-0" : "right-4.5"
        } ${visible ? "opacity-100" : `opacity-0 ${hoverClass}`}`}
      >
        <span className="block h-1.5 w-1.5 rounded-full bg-action-primary-background" />
      </span>
    );
  }

  // Underline — 2px content-primary bottom border for main-nav links.
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bottom-0 h-0.5 bg-content-primary transition-opacity duration-200 ${
        mobileFit ? "left-0 w-full" : "inset-x-0"
      } ${
        visible ? "opacity-100" : `opacity-0 ${hoverClass}`
      }`}
    />
  );
}

/** Left padding reserved for the absolutely positioned active indicator. */
export const navItemIndicatorPadding = "relative pl-4.5";
