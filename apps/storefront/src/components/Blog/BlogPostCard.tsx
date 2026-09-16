import Image from "next/image";
import Link from "next/link";
import { cmsSectionProps } from "@/components/cms/cms-section";
import type { CmsBlogPost } from "@/lib/cms/types";

function formatBlogDate(value?: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BlogPostCard({ post }: { post: CmsBlogPost }) {
  return (
    <article
      className="rounded-xl bg-white p-4 shadow-1"
      {...cmsSectionProps({ type: "blog-post-card", global: "posts", slug: post.slug })}
    >
      <Link className="block overflow-hidden rounded-md" href={`/blog/${post.slug}`}>
        <Image
          alt={post.title}
          className="aspect-[330/210] w-full rounded-md object-cover"
          height={210}
          src={post.featuredImageUrl}
          width={330}
        />
      </Link>
      <div className="mt-4">
        {post.publishedAt ? (
          <time className="mb-2 block text-content-muted text-custom-sm" dateTime={post.publishedAt}>
            {formatBlogDate(post.publishedAt)}
          </time>
        ) : null}
        <h2 className="mb-2 font-semibold text-content-primary text-lg">
          <Link className="duration-200 ease-out hover:text-content-brand" href={`/blog/${post.slug}`}>
            {post.title}
          </Link>
        </h2>
        {post.excerpt ? <p className="text-content-muted text-sm">{post.excerpt}</p> : null}
      </div>
    </article>
  );
}
