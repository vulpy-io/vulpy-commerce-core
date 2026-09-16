"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { subscribeNewsletterAction } from "@/app/actions/marketing";
import type { CmsBlock } from "@/lib/cms/types";

const Newsletter = ({
  newsletter,
}: {
  newsletter: Extract<CmsBlock, { blockType: "newsletter" }>;
}) => {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        await subscribeNewsletterAction(email);
        setEmail("");
        toast.success("Thank you for subscribing");
        const { trackCustomEvent } = await import("@/lib/analytics");
        trackCustomEvent("Engagement", "newsletter_subscribe");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not subscribe"
        );
      }
    });
  };

  if (!newsletter.bgImageUrl) {
    return (
      <section className="overflow-hidden py-16 xl:py-24">
        <div className="container">
          <div className="mx-auto max-w-[560px] text-center">
            <h2 className="h2 mb-3">
              {newsletter.title}
            </h2>
            {newsletter.subtitle ? (
              <p className="mb-8 text-content-muted">{newsletter.subtitle}</p>
            ) : null}
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  className="w-full rounded-control border border-border-subtle bg-surface px-5 py-3.5 text-[14px] outline-none placeholder:text-content-muted focus:border-content-primary"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={newsletter.placeholder}
                  required
                  type="email"
                  value={email}
                />
                <button
                  className="inline-flex shrink-0 justify-center rounded-control bg-action-primary-background px-8 py-3.5 font-button text-caps text-custom-xs text-white tracking-[0.08em] duration-200 ease-out hover:bg-action-primary-hover disabled:opacity-60"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? "Subscribing..." : "Subscribe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden py-16 xl:py-24">
      <div className="container">
        <div className="relative z-1 overflow-hidden rounded-panel">
          {newsletter.bgImageUrl && (
            <Image
              alt="background image"
              className="absolute top-0 left-0 -z-1 h-full w-full rounded-panel object-cover"
              fill
              src={newsletter.bgImageUrl}
            />
          )}
          <div className="absolute top-0 right-0 -z-1 h-full max-h-[243px] w-full max-w-[523px] bg-gradient-1" />
          <div className="flex flex-col gap-8 px-4 py-11 sm:px-7.5 lg:flex-row lg:items-center lg:justify-between xl:pr-14 xl:pl-12.5">
            <div className="w-full max-w-[491px]">
              <h2 className="mb-3 max-w-[399px] font-semibold text-caps text-lg text-white sm:text-xl xl:text-heading-4">
                {newsletter.title}
              </h2>
              <p className="text-white">{newsletter.subtitle}</p>
            </div>
            <div className="w-full max-w-[477px]">
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <input
                    className="w-full rounded-control border border-border-subtle bg-surface-muted px-5 py-3 outline-none placeholder:text-content-muted"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={newsletter.placeholder}
                    required
                    type="email"
                    value={email}
                  />
                  <button
                    className="inline-flex justify-center rounded-control bg-action-primary-background px-7 py-3 font-button text-white duration-200 ease-out hover:bg-action-primary-hover disabled:opacity-60"
                    disabled={isPending}
                    type="submit"
                  >
                    {isPending ? "Subscribing..." : "Subscribe"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Newsletter;
