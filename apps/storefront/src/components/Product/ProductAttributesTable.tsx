import type { ProductAttribute } from "@/types/product-detail";

export default function ProductAttributesTable({
  attributes,
  embedded = false,
}: {
  attributes: ProductAttribute[];
  embedded?: boolean;
}) {
  if (attributes.length === 0) {
    return null;
  }

  return (
    <div className={embedded ? "" : "rounded-xl bg-white p-4 shadow-1 sm:p-6"}>
      {attributes.map((attribute) => (
        <div
          className="flex rounded-md px-4 py-4 even:bg-gray-1 sm:px-5"
          key={`${attribute.label}-${attribute.value}`}
        >
          <div className="w-full min-w-[140px] max-w-[450px]">
            <p className={`text-sm sm:text-base ${embedded ? "text-content-secondary" : "text-content-primary"}`}>
              {attribute.label}
            </p>
          </div>
          <div className="w-full">
            <p className={`text-sm sm:text-base ${embedded ? "text-content-secondary" : "text-content-primary"}`}>
              {attribute.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
