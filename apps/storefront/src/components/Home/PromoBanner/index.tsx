"use client";
import Image from "next/image";
import Link from "next/link";
import "swiper/css/navigation";
import "swiper/css";
import type { CmsPromoBanner } from "@/lib/cms/types";

const PromoBanner = ({ banners }: { banners: CmsPromoBanner[] }) => {
  const [featured, ...rest] = banners;

  return (
    <section className="overflow-hidden py-16 xl:py-24">
      <div className="container w-full">
        {featured && (
          <div className="relative z-1 mb-7.5 flex flex-col items-stretch overflow-hidden rounded-panel bg-surface-subtle p-4 sm:p-7.5 lg:px-14 lg:py-17.5 xl:flex-row xl:items-stretch xl:px-19 xl:py-22.5">
            <div className="flex flex-col xl:hidden">
              <div className="text-left">
                <span className="mb-3 block font-medium text-content-primary text-xl">{featured.eyebrow}</span>
                <h2 className="mb-5 font-normal text-content-primary text-heading-4">
                  {featured.title}
                </h2>
                <p className="w-full">{featured.subtitle}</p>
              </div>
              {featured.imageUrl ? (
                <div className="my-5">
                  <Image
                    alt={featured.title || featured.eyebrow}
                    className="h-auto w-full object-contain"
                    height={548}
                    sizes="100vw"
                    src={featured.imageUrl}
                    width={548}
                  />
                </div>
              ) : null}
              <Link
                className="inline-flex self-start rounded-control bg-action-primary-background px-9.5 py-[11px] font-button text-custom-sm text-white duration-200 ease-out hover:bg-action-primary-hover"
                href={featured.ctaUrl}
              >
                {featured.ctaLabel}
              </Link>
            </div>
            <div className="hidden w-full max-w-[550px] shrink-0 text-left xl:block">
              <span className="mb-3 block font-medium text-content-primary text-xl">{featured.eyebrow}</span>
              <h2 className="mb-5 font-normal text-content-primary text-xl lg:text-heading-4 xl:text-heading-3">
                {featured.title}
              </h2>
              <p className="w-full">{featured.subtitle}</p>
              <Link
                className="mt-7.5 inline-flex rounded-control bg-action-primary-background px-9.5 py-[11px] font-button text-custom-sm text-white duration-200 ease-out hover:bg-action-primary-hover"
                href={featured.ctaUrl}
              >
                {featured.ctaLabel}
              </Link>
            </div>
            {featured.imageUrl ? (
              <div className="relative ml-auto hidden min-h-full w-full max-w-[274px] flex-1 xl:block">
                <Image
                  alt={featured.title || featured.eyebrow}
                  className="object-contain object-bottom"
                  fill
                  sizes="274px"
                  src={featured.imageUrl}
                />
              </div>
            ) : null}
          </div>
        )}
        <div className="grid grid-cols-1 gap-7.5 lg:grid-cols-2">
          {rest.map((banner) => (
            <div
              className="relative z-1 overflow-hidden rounded-panel bg-surface-subtle p-4 sm:p-7.5 lg:px-10 lg:py-16"
              key={banner.id}
            >
              <div className="flex flex-col lg:hidden">
                <div className="text-left">
                  <span className="mb-1.5 block font-medium text-content-primary text-lg">{banner.eyebrow}</span>
                  <h2 className="mb-2.5 font-semibold text-content-primary text-heading-4">
                    {banner.title}
                  </h2>
                  <p className="font-bold text-content-brand text-custom-1">{banner.subtitle}</p>
                </div>
                {banner.imageUrl ? (
                  <div className="my-5">
                    <Image
                      alt={banner.title || banner.eyebrow}
                      className="h-auto w-full object-contain"
                      height={482}
                      sizes="100vw"
                      src={banner.imageUrl}
                      width={482}
                    />
                  </div>
                ) : null}
                <Link
                  className="inline-flex self-start rounded-control bg-action-primary-background px-9.5 py-[11px] font-button text-custom-sm text-white duration-200 ease-out hover:bg-action-primary-hover"
                  href={banner.ctaUrl}
                >
                  {banner.ctaLabel}
                </Link>
              </div>
              <div className="hidden lg:block">
                {banner.imageUrl && (
                  <Image
                    alt={banner.title || banner.eyebrow}
                    className="absolute top-1/2 left-3 -z-1 -translate-y-1/2 sm:left-10"
                    height={241}
                    src={banner.imageUrl}
                    width={241}
                  />
                )}
                <div className="text-right">
                  <span className="mb-1.5 block font-medium text-content-primary text-lg">{banner.eyebrow}</span>
                  <h2 className="mb-2.5 font-semibold text-content-primary text-heading-4">
                    {banner.title}
                  </h2>
                  <p className="font-bold text-content-brand text-custom-1">{banner.subtitle}</p>
                  <Link
                    className="mt-7.5 inline-flex rounded-control bg-action-primary-background px-9.5 py-[11px] font-button text-custom-sm text-white duration-200 ease-out hover:bg-action-primary-hover"
                    href={banner.ctaUrl}
                  >
                    {banner.ctaLabel}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PromoBanner;
