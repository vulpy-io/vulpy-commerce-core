import type { Metadata } from "next";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getRegionId } from "@/lib/data";

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/recently-viewed", {
    title: "Recently viewed | Vulpy Commerce",
    description: "Products you recently viewed",
  }, { noindex: true });
}

export default async function RecentlyViewedPage() {
  const regionId = await getRegionId();

  return <RecentlyViewed regionId={regionId} />;
}
