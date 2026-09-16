import type { Category } from "@/types/category";
import SingleItem from "./SingleItem";

const Categories = ({
  categories,
  eyebrow,
  title,
  showHeader = true,
  variant = "default",
  className = "",
}: {
  categories: Category[];
  eyebrow: string;
  title: string;
  showHeader?: boolean;
  variant?: "default" | "embedded";
  className?: string;
}) => {
  const categoryItems = categories.map((item) => (
    <SingleItem
      embedded={variant === "embedded"}
      item={item}
      key={item.medusaId ?? item.handle ?? item.id}
    />
  ));

  return (
    <section
      className={`overflow-hidden ${
        variant === "embedded" ? "" : "pt-16 xl:pt-24"
      } ${className}`.trim()}
    >
      <div
        className={`container w-full ${
          variant === "embedded" ? "pb-8" : "pb-15"
        }`}
      >
        {variant !== "embedded" && showHeader ? (
          <div className="mb-10 flex items-center justify-between">
            <div>
              {eyebrow ? (
                <span className="eyebrow mb-2 flex items-center gap-2.5">
                  {eyebrow}
                </span>
              ) : null}
              <h2 className="h2">
                {title}
              </h2>
            </div>
          </div>
        ) : null}
        {variant === "embedded" ? (
          <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {categoryItems}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
            {categoryItems}
          </div>
        )}
      </div>
    </section>
  );
};

export default Categories;