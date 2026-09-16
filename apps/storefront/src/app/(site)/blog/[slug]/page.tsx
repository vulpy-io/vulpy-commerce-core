import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import BlogPostCard from "@/components/Blog/BlogPostCard";
import PageLayout from "@/components/Common/PageLayout";
import { cmsSectionProps } from "@/components/cms/cms-section";
import { RichText } from "@/components/cms/RichText";
import JsonLd from "@/components/seo/JsonLd";
import {
  getBlogPostBySlug,
  getBlogPosts,
  getSiteSettings,
} from "@/lib/cms/queries";
import { formatSeoTitle } from "@/lib/seo/format-seo-title";
import {
  buildSocialMetadata,
  withCanonical,
} from "@/lib/seo/metadata";
import { buildBlogPostingJsonLd } from "@/lib/seo/structured-data";

function formatBlogDate(value?: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [post, settings] = await Promise.all([
    getBlogPostBySlug(slug),
    getSiteSettings(),
  ]);
  if (!post) {
    return { title: formatSeoTitle("Not found", settings.siteName) };
  }
  const title = formatSeoTitle(post.seo.title || post.title, settings.siteName);
  const path = `/blog/${slug}`;
  return withCanonical(
    {
      title,
      description: post.seo.description,
      ...buildSocialMetadata({
        title,
        description: post.seo.description || post.excerpt,
        url: path,
        siteName: settings.siteName,
        images: post.featuredImageUrl ? [post.featuredImageUrl] : undefined,
        type: "article",
      }),
    },
    path
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, recentPostsResult, settings] = await Promise.all([
    getBlogPostBySlug(slug),
    getBlogPosts(1, 4),
    getSiteSettings(),
  ]);
  if (!post) {
    notFound();
  }

  const recentPosts = recentPostsResult.posts
    .filter((entry) => entry.slug !== slug)
    .slice(0, 3);
  const path = `/blog/${slug}`;

  return (
    <PageLayout
      breadcrumbCurrentPath={path}
      breadcrumbItems={[
        { label: "Blog", href: "/blog" },
        { label: post.title },
      ]}
      title={post.title}
    >
      <JsonLd
        data={buildBlogPostingJsonLd({
          headline: post.title,
          description: post.seo.description || post.excerpt,
          path,
          image: post.featuredImageUrl,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt || post.publishedAt,
          authorName: post.authorName,
          publisherName: settings.siteName,
          publisherLogo: settings.logoUrl,
        })}
      />
      <section
        className="py-20"
        {...cmsSectionProps({ type: "blog-post", global: "posts", slug })}
      >
        <article className="container max-w-3xl">
          {post.featuredImageUrl ? (
            <div className="mb-6 flex justify-center">
              <Image
                alt={post.title}
                className="max-h-[80dvh] w-full rounded-xl object-contain"
                height={800}
                src={post.featuredImageUrl}
                width={1200}
              />
            </div>
          ) : null}
          {post.publishedAt ? (
            <time
              className="mb-6 block text-content-muted text-sm"
              dateTime={post.publishedAt}
            >
              {formatBlogDate(post.publishedAt)}
            </time>
          ) : null}
          {post.excerpt ? <p className="mb-8 text-content-primary">{post.excerpt}</p> : null}
          <div
            {...cmsSectionProps({
              type: "blog-post-content",
              global: "posts",
              slug,
            })}
          >
            <RichText data={post.content} />
          </div>
        </article>
        {recentPosts.length > 0 ? (
          <section className="container mt-16 border-gray-3 border-t pt-12">
            <h2 className="mb-8 font-bold text-2xl text-content-primary">Latest posts</h2>
            <div className="grid grid-cols-1 gap-7.5 md:grid-cols-3">
              {recentPosts.map((entry) => (
                <BlogPostCard key={entry.id} post={entry} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </PageLayout>
  );
}
