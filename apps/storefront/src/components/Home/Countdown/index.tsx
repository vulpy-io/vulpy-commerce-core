"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isCountdownDeadlineFuture } from "@/lib/cms/countdown";
import type { CmsBlock } from "@/lib/cms/types";

const CounDown = ({ promo }: { promo: Extract<CmsBlock, { blockType: "countdownPromo" }> }) => {
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(() => isCountdownDeadlineFuture(promo.deadline));

  useEffect(() => {
    if (!isCountdownDeadlineFuture(promo.deadline)) {
      setIsActive(false);
      return;
    }

    const deadline = promo.deadline;
    const getTime = () => {
      const time = Date.parse(deadline) - Date.now();
      if (time <= 0) {
        setIsActive(false);
        return;
      }
      setDays(Math.floor(time / (1000 * 60 * 60 * 24)));
      setHours(Math.floor((time / (1000 * 60 * 60)) % 24));
      setMinutes(Math.floor((time / 1000 / 60) % 60));
      setSeconds(Math.floor((time / 1000) % 60));
    };
    getTime();
    const interval = setInterval(getTime, 1000);
    return () => clearInterval(interval);
  }, [promo.deadline]);

  if (!isActive) {
    return null;
  }

  return (
    <section className="overflow-hidden py-16 xl:py-24">
      <div className="container w-full">
        <div className="relative z-1 flex flex-col items-stretch overflow-hidden rounded-panel bg-surface px-4 py-10 sm:px-7.5 lg:flex-row lg:p-10 xl:p-15">
          {promo.imageUrl ? (
            <Image
              alt={promo.productName}
              className="absolute top-1/2 left-3 -z-1 h-auto w-[180px] -translate-y-1/2 object-contain sm:left-10 lg:hidden"
              height={320}
              src={promo.imageUrl}
              width={320}
            />
          ) : null}
          <div className="w-full max-w-[422px] shrink-0 text-right lg:text-left">
            <span className="mb-2.5 block font-medium text-content-primary text-custom-1">
              {promo.eyebrow}
            </span>
            <h2 className="mb-3 font-normal text-content-primary text-xl lg:text-heading-4 xl:text-heading-3">
              {promo.title}
            </h2>
            <p className="w-full">{promo.body}</p>
            <div className="mt-6 flex flex-wrap gap-6">
              {[
                { label: "Days", value: days },
                { label: "Hours", value: hours },
                { label: "Minutes", value: minutes },
                { label: "Seconds", value: seconds },
              ].map((item) => (
                <div key={item.label}>
                  <span className="mb-1 block font-bold text-content-primary text-xl">{item.value}</span>
                  <span className="text-custom-sm">{item.label}</span>
                </div>
              ))}
            </div>
            <Link
              className="mt-8 inline-flex rounded-control bg-action-primary-background px-9 py-3 font-button text-custom-sm text-white duration-200 ease-out hover:bg-action-primary-hover"
              href={promo.ctaUrl}
            >
              {promo.ctaLabel}
            </Link>
          </div>
          {promo.imageUrl ? (
            <div className="relative ml-auto hidden min-h-full w-full max-w-[320px] flex-1 self-stretch lg:block">
              <Image
                alt={promo.productName}
                className="object-contain object-bottom object-right"
                fill
                sizes="320px"
                src={promo.imageUrl}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default CounDown;
