import type { Metadata } from "next";
import { Wishlist } from "@/components/Wishlist";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getRegionId } from "@/lib/data";

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/wishlist", {
    title: "Wishlist | Vulpy Commerce",
    description: "Your saved products",
  }, { noindex: true });
}

export default async function WishlistPage() {
  const regionId = await getRegionId();

  return <Wishlist regionId={regionId} />;
}
