import Image from "next/image";
import Link from "next/link";
import { categoryPagePath } from "@/lib/medusa/category-path";
import type { Category } from "@/types/category";

const SingleItem = ({
  item,
  embedded = false,
}: {
  item: Category;
  /** PLP/embedded variant — no tile background behind the thumb. */
  embedded?: boolean;
}) => {
  const href = item.handle ? categoryPagePath({ handle: item.handle }) : "/shop";

  return (
    <Link
      className={`group relative block overflow-hidden ${
        embedded ? "bg-transparent" : "bg-surface-muted"
      }`}
      href={href}
    >
      <div className="relative aspect-[6/7] w-full overflow-hidden">
        {item.img ? (
          <Image
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            src={item.img}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <h3 className="relative inline-block font-medium text-2xl text-white leading-[1.2] tracking-[0.01em]">
          {item.title}
          <span className="absolute -bottom-1 left-0 h-px w-0 bg-white transition-[width] duration-500 group-hover:w-full" />
        </h3>
      </div>
    </Link>
  );
};

export default SingleItem;
