import Image from "next/image";
import Link from "next/link";

const LatestPosts = ({ blogs }) => {
  return (
    <div className="mt-7.5 rounded-xl bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-4.5 sm:px-6">
        <h2 className="font-semibold text-content-primary text-lg">Latest posts</h2>
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-6">
          {/* <!-- post item --> */}

          {blogs.slice(0, 3).map((blog, key) => (
            <div className="flex items-center gap-4" key={key}>
              <Link
                className="w-full max-w-[110px] overflow-hidden rounded-panel"
                href="/blog"
              >
                <Image
                  alt="blog"
                  className="w-full rounded-panel"
                  height={80}
                  src={blog.img}
                  width={110}
                />
              </Link>

              <div>
                <h3 className="mb-1.5 text-content-primary leading-[22px] duration-200 ease-out hover:text-content-brand">
                  <Link href="/blog">{blog.title}</Link>
                </h3>

                <span className="flex items-center gap-3">
                  <a
                    className="text-custom-xs duration-200 ease-out hover:text-content-brand"
                    href="#"
                  >
                    {blog.date}
                  </a>

                  {/* <!-- divider --> */}
                  <span className="block h-4 w-px bg-gray-4" />

                  <a
                    className="text-custom-xs duration-200 ease-out hover:text-content-brand"
                    href="#"
                  >
                    {blog.views}k views
                  </a>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LatestPosts;
