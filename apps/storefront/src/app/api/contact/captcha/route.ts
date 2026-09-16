import { NextResponse } from "next/server";
import { createContactCaptchaChallenge } from "@/lib/contact/captcha";

export const dynamic = "force-dynamic";

export function GET() {
  const challenge = createContactCaptchaChallenge();
  return NextResponse.json(challenge);
}
