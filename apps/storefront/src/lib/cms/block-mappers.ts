import { getMediaUrl } from "./media";
import type { CmsBlock } from "./types";
import { buildExternalVideoEmbedUrl } from "./video-embed";

type UnknownRecord = Record<string, unknown>;

function mapHeroBlock(block: UnknownRecord): CmsBlock {
  const slides = ((block.slides as UnknownRecord[]) || []).map((slide, index) => ({
    id: String(slide.id || index),
    eyebrow: (slide.eyebrow as string) || "",
    title: (slide.title as string) || "",
    discountValue: (slide.discountValue as string) || "",
    body: (slide.body as string) || "",
    ctaLabel: (slide.ctaLabel as string) || "Shop Now",
    ctaUrl: (slide.ctaUrl as string) || "/shop",
    imageUrl: getMediaUrl(slide.image as never, ""),
  }));

  const promos = ((block.promos as UnknownRecord[]) || []).map((promo, index) => ({
    id: String(promo.id || index),
    title: (promo.title as string) || "",
    priceLabel: (promo.priceLabel as string) || "",
    offerText: (promo.offerText as string) || "",
    ctaLabel: (promo.ctaLabel as string) || "",
    link: (promo.link as string) || "/shop",
    imageUrl: getMediaUrl(promo.image as never, ""),
  }));

  const badges = ((block.badges as UnknownRecord[]) || []).map((badge, index) => ({
    id: String(badge.id || index),
    title: (badge.title as string) || "",
    description: (badge.description as string) || "",
    iconUrl: getMediaUrl(badge.icon as never, "/images/icons/icon-01.svg"),
  }));

  return {
    blockType: "hero",
    slides,
    promos,
    badges,
  };
}

export function mapBlocks(rawBlocks: unknown): CmsBlock[] {
  const blocks = (rawBlocks as UnknownRecord[]) || [];
  return blocks.map((block) => {
    const blockType = block.blockType as string;
    switch (blockType) {
      case "hero":
        return mapHeroBlock(block);
      case "categoryGrid":
        return {
          blockType,
          eyebrow: (block.eyebrow as string) || "",
          title: (block.title as string) || "",
          limit: (block.limit as number) || 12,
          categoryHandles: (block.categoryHandles as { handle: string }[]) || [],
        };
      case "productGrid":
        return {
          blockType,
          title: (block.title as string) || "",
          eyebrow: (block.eyebrow as string) || "",
          subtitle: (block.subtitle as string) || "",
          ctaLabel: (block.ctaLabel as string) || "",
          ctaUrl: (block.ctaUrl as string) || "",
          variant: (block.variant as string) || "new-arrivals",
          limit: (block.limit as number) || 4,
        };
      case "promoBanners":
        return {
          blockType,
          banners: ((block.banners as UnknownRecord[]) || []).map((banner, index) => ({
            id: String(banner.id || index),
            eyebrow: (banner.eyebrow as string) || "",
            title: (banner.title as string) || "",
            subtitle: (banner.subtitle as string) || "",
            ctaLabel: (banner.ctaLabel as string) || "",
            ctaUrl: (banner.ctaUrl as string) || "/shop",
            imageUrl: getMediaUrl(banner.image as never, ""),
          })),
        };
      case "countdownPromo":
        return {
          blockType,
          eyebrow: (block.eyebrow as string) || "",
          title: (block.title as string) || "",
          body: (block.body as string) || "",
          productName: (block.productName as string) || "",
          deadline: (block.deadline as string) || "",
          ctaLabel: (block.ctaLabel as string) || "",
          ctaUrl: (block.ctaUrl as string) || "",
          imageUrl: getMediaUrl(block.image as never, ""),
        };
      case "testimonials":
        return {
          blockType,
          eyebrow: (block.eyebrow as string) || "",
          title: (block.title as string) || "",
          items: ((block.items as UnknownRecord[]) || []).map((item, index) => ({
            id: String(item.id || index),
            quote: (item.quote as string) || "",
            authorName: (item.authorName as string) || "",
            authorRole: (item.authorRole as string) || "",
            avatarUrl: getMediaUrl(item.avatar as never, "/images/users/user-01.jpg"),
          })),
        };
      case "newsletter":
        return {
          blockType,
          title: (block.title as string) || "",
          subtitle: (block.subtitle as string) || "",
          placeholder: (block.placeholder as string) || "",
          bgImageUrl: getMediaUrl(block.bgImage as never, ""),
        };
      case "richText":
        return { blockType, content: block.content };
      case "contactInfo":
        return {
          blockType,
          contactName: (block.contactName as string) || "",
          contactPhone: (block.contactPhone as string) || "",
          contactEmail: (block.contactEmail as string) || "",
          contactAddress: (block.contactAddress as string) || "",
        };
      case "contactForm":
        return {
          blockType,
          title: (block.title as string) || "Contact us",
          subtitle: (block.subtitle as string) || "",
        };
      case "cta":
        return {
          blockType,
          title: (block.title as string) || "",
          body: (block.body as string) || "",
          theme: (block.theme as "blue" | "teal" | "dark") || "blue",
          imageUrl: getMediaUrl(block.image as never, ""),
          links: ((block.links as UnknownRecord[]) || []).map((link) => ({
            label: (link.label as string) || "",
            url: (link.url as string) || "#",
          })),
        };
      case "faq":
        return {
          blockType,
          title: (block.title as string) || "",
          items: ((block.items as UnknownRecord[]) || []).map((item) => ({
            question: (item.question as string) || "",
            answer: (item.answer as string) || "",
          })),
        };
      case "media":
        return {
          blockType,
          caption: (block.caption as string) || "",
          imageUrl: getMediaUrl(block.image as never, ""),
        };
      case "banner":
        return {
          blockType,
          eyebrow: (block.eyebrow as string) || "",
          title: (block.title as string) || "",
          body: (block.body as string) || "",
          ctaLabel: (block.ctaLabel as string) || "",
          ctaUrl: (block.ctaUrl as string) || "",
          imageUrl: getMediaUrl(block.image as never, ""),
        };
      case "mediaWithText": {
        const mediaType =
          (block.mediaType as "image" | "upload" | "youtube" | "vimeo") || "image";
        const autoplay = Boolean(block.autoplay);
        const externalVideoUrl = (block.videoUrl as string) || "";
        const embedUrl =
          mediaType === "youtube" || mediaType === "vimeo"
            ? buildExternalVideoEmbedUrl(mediaType, externalVideoUrl, autoplay) || ""
            : "";

        return {
          blockType,
          title: (block.title as string) || "",
          content: block.content,
          ctaLabel: (block.ctaLabel as string) || "",
          ctaUrl: (block.ctaUrl as string) || "",
          mediaType,
          imageUrl: getMediaUrl(block.image as never, ""),
          videoUrl: getMediaUrl(block.video as never, ""),
          embedUrl,
          autoplay,
          mediaPosition: (block.mediaPosition as "left" | "right") || "left",
          swapOnMobile: Boolean(block.swapOnMobile),
        };
      }
      case "spacer":
        return { blockType, size: (block.size as number) || 48 };
      default:
        return { blockType: "spacer", size: 0 };
    }
  });
}
