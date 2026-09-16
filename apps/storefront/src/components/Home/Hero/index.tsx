import Image from "next/image";
import Link from "next/link";
import type { CmsHeroPromo, CmsHeroSlide, CmsTrustBadge } from "@/lib/cms/types";
import HeroCarousel from "./HeroCarousel";
import HeroFeature from "./HeroFeature";

const Hero = ({
  slides,
  promos,
  badges,
}: {
  slides: CmsHeroSlide[];
  promos: CmsHeroPromo[];
  badges: CmsTrustBadge[];
}) => {
  if (promos.length === 0) {
    return (
      <section className="bg-surface-inverse pt-[var(--header-height)]">
        <HeroCarousel slides={slides} variant="fullbleed" />
        {badges.length > 0 ? <HeroFeature badges={badges} /> : null}
      </section>
    );
  }

  return (
    <section className="overflow-hidden pt-[var(--header-height)] pb-12 lg:pb-14 xl:pb-16">
      <div className="container w-full">
        <div className="flex flex-wrap justify-center gap-5 xl:flex-nowrap xl:items-stretch">
          <div className="flex w-full flex-col xl:max-w-[757px] xl:flex-1">
            <div className="relative z-1 overflow-hidden rounded-panel bg-surface-inverse py-5 xl:h-full xl:py-0">
              <HeroCarousel slides={slides} />
            </div>
          </div>
          <div className="flex w-full flex-col xl:max-w-[393px]">
            <div className="flex flex-1 flex-col gap-5 sm:flex-row xl:flex-col">
              {promos.map((promo) => (
                <div
                  className="relative z-1 flex w-full flex-1 flex-col overflow-hidden rounded-panel bg-surface p-5 sm:p-7.5"
                  key={promo.id}
                >
                  <div className="flex flex-1 flex-col xl:flex-row xl:items-stretch xl:gap-14">
                    <div className="contents xl:flex xl:min-w-0 xl:flex-1 xl:flex-col xl:justify-between">
                      <div className="text-left">
                        <h2 className="font-medium text-2xl text-caps text-content-primary lg:text-heading-5 xl:max-w-[190px]">
                          <Link href={promo.link}>{promo.title}</Link>
                        </h2>
                        {promo.offerText ? (
                          <p className="mt-1.5 font-normal text-content-muted text-custom-sm">
                            {promo.offerText}
                          </p>
                        ) : null}
                      </div>

                      <div className="order-3 text-left xl:order-none">
                        {promo.priceLabel ? (
                          <span className="block font-normal text-heading-5 text-status-danger">
                            {promo.priceLabel}
                          </span>
                        ) : null}
                        {promo.ctaLabel ? (
                          <Link
                            className="mt-4 inline-flex items-center gap-1.5 font-normal text-caps text-content-primary text-custom-sm duration-200 ease-out hover:text-content-brand"
                            href={promo.link}
                          >
                            {promo.ctaLabel}
                            <span aria-hidden>→</span>
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {promo.imageUrl ? (
                      <div className="order-2 my-5 xl:order-none xl:my-0 xl:shrink-0 xl:self-center">
                        <Image
                          alt={promo.title}
                          className="h-auto w-full object-contain xl:w-[185px]"
                          height={484}
                          sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 185px"
                          src={promo.imageUrl}
                          width={370}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <HeroFeature badges={badges} />
    </section>
  );
};

export default Hero;
