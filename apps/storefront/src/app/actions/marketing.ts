"use server";

import config from "@payload-config";
import { getPayload } from "payload";
import { verifyContactCaptchaAnswer } from "@/lib/contact/captcha";

export async function subscribeNewsletterAction(email: string) {
  if (!email.includes("@")) {
    throw new Error("Enter a valid email address");
  }

  console.info("[newsletter-subscribe]", { email });
  await Promise.resolve();
}

export async function submitContactFormAction(data: {
  email: string;
  message: string;
  name: string;
  subject?: string;
  captchaToken: string;
  captchaAnswer: string;
}) {
  if (!((data.email.includes("@") && data.message.trim()) && data.name.trim())) {
    throw new Error("Please complete the contact form");
  }

  if (!verifyContactCaptchaAnswer(data.captchaToken, data.captchaAnswer)) {
    throw new Error("Incorrect verification answer. Please try again.");
  }

  const dbUrl = process.env.DATABASE_URI || process.env.PAYLOAD_DATABASE_URL;
  if (!dbUrl) {
    throw new Error("Service temporarily unavailable");
  }

  const payload = await getPayload({ config });
  await payload.create({
    collection: "contact-submissions" as "pages",
    data: {
      name: data.name.trim(),
      email: data.email.trim(),
      subject: data.subject?.trim() || "",
      message: data.message.trim(),
    } as never,
    overrideAccess: true,
  });
}
