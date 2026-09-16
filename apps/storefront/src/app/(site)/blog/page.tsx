import type { Metadata } from "next";
import Link from "next/link";
import BlogPostCard from "@/components/Blog/BlogPostCard";
import PageLayout from "@/components/Common/PageLayout";
import { cmsSectionProps } from "@/components/cms/cms-section";
import JsonLd from "@/components/seo/JsonLd";
import { getBlogPosts, getSiteSettings, getUtilitySeo } from "@/lib/cms/queries";
import {
  buildSocialMetadata,
  withCanonical,
} from "@/lib/seo/metadata";
import { buildBlogJsonLd } from "@/lib/seo/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const seo = getUtilitySeo(settings, "/blog", {
    title: "Blog | Vulpy Commerce",
    description: "News and professional tips",
  });
  const title = seo.title;
  const description = seo.description;
  return withCanonical(
    {
      title,
      description,
      ...buildSocialMetadata({
        title,
        description,
        url: "/blog",
        siteName: settings.siteName,
        type: "website",
      }),
    },
    "/blog"
  );
}

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page || "1");
  const [settings, { posts, totalPages }] = await Promise.all([
    getSiteSettings(),
    getBlogPosts(page, 9),
  ]);
  const seo = getUtilitySeo(settings, "/blog", {
    title: "Blog | Vulpy Commerce",
    description: "News and professional tips",
  });

  return (
    <PageLayout breadcrumbCurrentPath="/blog" breadcrumbItems={[{ label: "Blog" }]} title="Blog">
      <JsonLd
        data={buildBlogJsonLd({
          name: seo.title,
          description: seo.description,
          path: "/blog",
        })}
      />
      <section
        className="bg-gray-2 py-20"
        {...cmsSectionProps({ type: "blog-list", global: "posts" })}
      >
        <div className="container">
          <div className="grid grid-cols-1 gap-7.5 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
          {posts.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center shadow-1">
              No blog posts yet.
            </div>
          ) : null}
          {totalPages > 1 && (
            <div className="mt-10 flex gap-3">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  className={`rounded-md px-4 py-2 ${p === page ? "bg-action-primary-background text-white" : "bg-white"}`}
                  href={`/blog?page=${p}`}
                  key={p}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
