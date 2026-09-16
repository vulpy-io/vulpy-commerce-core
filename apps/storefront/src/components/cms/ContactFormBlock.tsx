"use client";

import { useEffect, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { submitContactFormAction } from "@/app/actions/marketing";

type CaptchaChallenge = {
  token: string;
  question: string;
};

export default function ContactFormBlock({
  embedded = false,
  subtitle,
  title,
}: {
  embedded?: boolean;
  subtitle?: string;
  title?: string;
}) {
  const [form, setForm] = useState({
    email: "",
    message: "",
    name: "",
    subject: "",
    captchaAnswer: "",
  });
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadCaptcha = async () => {
    try {
      const response = await fetch("/api/contact/captcha");
      if (!response.ok) {
        throw new Error("captcha fetch failed");
      }
      const challenge = (await response.json()) as CaptchaChallenge;
      setCaptcha(challenge);
      setForm((current) => ({ ...current, captchaAnswer: "" }));
    } catch {
      toast.error("Could not load verification");
    }
  };

  useEffect(() => {
    loadCaptcha().catch(() => undefined);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!captcha?.token) {
      toast.error("Please wait for verification to load");
      return;
    }

    startTransition(async () => {
      try {
        await submitContactFormAction({
          ...form,
          captchaToken: captcha.token,
        });
        setForm({ email: "", message: "", name: "", subject: "", captchaAnswer: "" });
        await loadCaptcha();
        toast.success("Message sent");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not send message"
        );
        await loadCaptcha();
      }
    });
  };

  const shellClass = embedded
    ? "rounded-xl bg-white p-6 shadow-1"
    : "container py-10";

  return (
    <section className={shellClass}>
      <div className={embedded ? undefined : "rounded-xl bg-white p-6 shadow-1"}>
        <div className="mb-6">
          <h2 className="h2">{title || "Contact us"}</h2>
          {subtitle ? <p className="mt-2 text-content-muted">{subtitle}</p> : null}
        </div>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              className="rounded-md border border-gray-3 bg-gray-1 px-5 py-3"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Your name"
              required
              value={form.name}
            />
            <input
              className="rounded-md border border-gray-3 bg-gray-1 px-5 py-3"
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="Email address"
              required
              type="email"
              value={form.email}
            />
          </div>
          <input
            className="rounded-md border border-gray-3 bg-gray-1 px-5 py-3"
            onChange={(event) => setForm({ ...form, subject: event.target.value })}
            placeholder="Subject"
            value={form.subject}
          />
          <textarea
            className="min-h-40 rounded-md border border-gray-3 bg-gray-1 px-5 py-3"
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            placeholder="Message"
            required
            value={form.message}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <label className="mb-1 block text-content-muted text-sm" htmlFor="contact-captcha">
                {captcha?.question || "Loading verification..."}
              </label>
              <input
                className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-3"
                id="contact-captcha"
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, captchaAnswer: event.target.value })
                }
                placeholder="Answer"
                required
                value={form.captchaAnswer}
              />
            </div>
            <button
              className="text-content-brand text-sm hover:underline"
              onClick={() => {
                loadCaptcha().catch(() => undefined);
              }}
              type="button"
            >
              Other question
            </button>
          </div>
          <button
            className="w-fit rounded-md bg-action-primary-background px-8 py-3 font-semibold text-white disabled:opacity-60"
            disabled={isPending || !captcha}
            type="submit"
          >
            {isPending ? "Sending..." : "Send message"}
          </button>
        </form>
      </div>
    </section>
  );
}
