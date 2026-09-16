import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Cart from "@/components/Cart";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getSiteSettings } from "@/lib/cms/queries";

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/cart", {
    title: "Cart | Vulpy Commerce",
    description: "Your shopping cart",
  }, { noindex: true });
}

export default async function CartPage() {
  const siteSettings = await getSiteSettings();
  if (siteSettings.hideCart) {
    redirect("/checkout");
  }

  return <Cart paymentMethods={siteSettings.paymentMethods} />;
}
