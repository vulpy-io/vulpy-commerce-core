import type { Metadata } from "next";
import Signin from "@/components/Auth/Signin";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getSiteSettings } from "@/lib/cms/queries";

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/signin", {
    title: "Sign in | Vulpy Commerce",
    description: "Sign in to your account",
  }, { noindex: true });
}

export default async function SigninPage() {
  const settings = await getSiteSettings();
  return <Signin authLabels={settings.authLabels} />;
}
