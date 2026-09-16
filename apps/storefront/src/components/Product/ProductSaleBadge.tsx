import { getDiscountPercent } from "@/lib/medusa/stock";

export default function ProductSaleBadge({
  price,
  discountedPrice,
  className = "",
}: {
  price: number;
  discountedPrice: number;
  className?: string;
}) {
  const percent = getDiscountPercent(price, discountedPrice);
  if (percent === null) {
    return null;
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded bg-action-primary-background px-2.5 py-0.5 font-semibold text-custom-sm text-white ${className}`}
    >
      {percent}% OFF
    </span>
  );
}
