"use client";

import Image from "next/image";
import Link from "next/link";
import { RichText } from "@/components/cms/RichText";
import { useCanLoadExternalMedia, useConsent } from "@/context/ConsentContext";
import { trackCustomEvent } from "@/lib/analytics";
import type { CmsBlock } from "@/lib/cms/types";

type MediaWithTextBlockData = Extract<CmsBlock, { blockType: "mediaWithText" }>;

function ExternalMediaGate({
  title,
  provider,
  children,
}: {
  title: string;
  provider: string;
  children: React.ReactNode;
}) {
  const allowed = useCanLoadExternalMedia();
  const { openPreferences } = useConsent();

  if (!allowed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-panel bg-surface-muted px-6 text-center">
        <p className="text-content-muted text-custom-sm">
          {provider} embeds load only after you allow external media cookies.
        </p>
        <button
          className="rounded-control bg-action-primary-background px-4 py-2 font-button text-custom-sm text-white hover:bg-action-primary-hover"
          onClick={openPreferences}
          type="button"
        >
          Cookie settings
        </button>
      </div>
    );
  }

  return (
    <div
      onLoad={() => {
        trackCustomEvent("Engagement", "external_media_play", `${provider}|${title}`);
      }}
    >
      {children}
    </div>
  );
}

function BlockMedia({
  block,
  title,
}: {
  block: MediaWithTextBlockData;
  title: string;
}) {
  if (block.mediaType === "image" && block.imageUrl) {
    return (
      <Image
        alt={title}
        className="h-auto w-full rounded-panel object-cover"
        height={720}
        src={block.imageUrl}
        width={1280}
      />
    );
  }

  if (block.mediaType === "upload" && block.videoUrl) {
    return (
      <video
        autoPlay={block.autoplay}
        className="h-auto w-full rounded-panel"
        controls={!block.autoplay}
        loop={block.autoplay}
        muted={block.autoplay}
        playsInline
        src={block.videoUrl}
      >
        <track kind="captions" />
      </video>
    );
  }

  if ((block.mediaType === "youtube" || block.mediaType === "vimeo") && block.embedUrl) {
    const provider = block.mediaType === "youtube" ? "YouTube" : "Vimeo";
    return (
      <ExternalMediaGate provider={provider} title={title}>
        <div className="relative aspect-video w-full overflow-hidden rounded-panel">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
            src={block.embedUrl}
            title={title}
          />
        </div>
      </ExternalMediaGate>
    );
  }

  return null;
}

export default function MediaWithTextBlock({
  block,
}: {
  block: MediaWithTextBlockData;
}) {
  const hasMedia =
    (block.mediaType === "image" && Boolean(block.imageUrl)) ||
    (block.mediaType === "upload" && Boolean(block.videoUrl)) ||
    ((block.mediaType === "youtube" || block.mediaType === "vimeo") &&
      Boolean(block.embedUrl));

  const textOrder = block.swapOnMobile ? "order-2" : "order-1";
  const mediaOrder = block.swapOnMobile ? "order-1" : "order-2";
  const desktopTextOrder = block.mediaPosition === "right" ? "lg:order-1" : "lg:order-2";
  const desktopMediaOrder = block.mediaPosition === "left" ? "lg:order-1" : "lg:order-2";

  return (
    <div
      className={`grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12 ${hasMedia ? "" : "max-w-3xl"}`}
    >
      <div className={`${textOrder} ${desktopTextOrder}`}>
        <h2 className="h2 mb-4">{block.title}</h2>
        {block.content ? (
          <RichText className="mx-0 max-w-none" data={block.content} />
        ) : null}
        {block.ctaLabel && block.ctaUrl ? (
          <Link
            className="mt-6 inline-flex rounded-control bg-action-primary-background px-9.5 py-[11px] font-button text-custom-sm text-white duration-200 ease-out hover:bg-action-primary-hover"
            href={block.ctaUrl}
          >
            {block.ctaLabel}
          </Link>
        ) : null}
      </div>
      {hasMedia ? (
        <div className={`${mediaOrder} ${desktopMediaOrder}`}>
          <BlockMedia block={block} title={block.title} />
        </div>
      ) : null}
    </div>
  );
}
