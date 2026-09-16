import type { Metadata } from "next";
import Signup from "@/components/Auth/Signup";
import { generateUtilityMetadata } from "@/lib/cms/metadata";
import { getSiteSettings } from "@/lib/cms/queries";

export function generateMetadata(): Promise<Metadata> {
  return generateUtilityMetadata("/signup", {
    title: "Register | Vulpy Commerce",
    description: "Create an account",
  }, { noindex: true });
}

export default async function SignupPage() {
  const settings = await getSiteSettings();
  return <Signup authLabels={settings.authLabels} />;
}
