import {
  getBadgeTextColor,
  type ProductStoreTag,
} from "@/lib/medusa/product-tags";

export default function ProductStoreTagBadges({
  tags,
  className = "",
}: {
  tags?: ProductStoreTag[];
  className?: string;
}) {
  if (!tags?.length) {
    return null;
  }

  return (
    <>
      {tags.map((tag) => (
        <span
          className={`inline-flex whitespace-nowrap rounded px-2.5 py-0.5 font-semibold text-custom-sm ${className}`}
          key={tag.id}
          style={{
            backgroundColor: tag.color,
            color: getBadgeTextColor(tag.color),
          }}
        >
          {tag.label}
        </span>
      ))}
    </>
  );
}
