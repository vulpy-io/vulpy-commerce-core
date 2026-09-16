import type { Metadata } from "next";
import Checkout from "@/components/Checkout";
import { generateUtilityMetadata } from "@/lib/cms/metadata";

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/checkout", {
    title: "Checkout | Vulpy Commerce",
    description: "Complete your order",
  }, { noindex: true });
}

export default function CheckoutPage() {
  return <Checkout />;
}
