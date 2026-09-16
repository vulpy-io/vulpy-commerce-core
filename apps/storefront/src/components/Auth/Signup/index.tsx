"use client";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import Link from "next/link";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { registerCustomerAction } from "@/app/actions/customer";
import PageLayout from "@/components/Common/PageLayout";
import type { CmsSiteSettings } from "@/lib/cms/types";

const Signup = ({ authLabels }: { authLabels: CmsSiteSettings["authLabels"] }) => {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await registerCustomerAction(form);
      } catch (error) {
        if (isRedirectError(error)) {
          throw error;
        }
        toast.error(
          error instanceof Error ? error.message : "Could not create account"
        );
      }
    });
  };

  return (
    <PageLayout title="Register">
      <section className="overflow-hidden bg-gray-2 py-20">
        <div className="container w-full">
          <div className="mx-auto w-full max-w-[570px] rounded-xl bg-white p-4 shadow-1 sm:p-7.5 xl:p-11">
            <div className="mb-11 text-center">
              <h3 className="mb-1.5 font-bold text-content-primary text-xl sm:text-2xl">
                {authLabels.signUpTitle}
              </h3>
              <p>{authLabels.signUpSubtitle}</p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <input
                className="w-full rounded-lg border border-gray-3 bg-gray-1 px-5 py-3"
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="First name"
                required
                value={form.first_name}
              />
              <input
                className="w-full rounded-lg border border-gray-3 bg-gray-1 px-5 py-3"
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Last name"
                required
                value={form.last_name}
              />
              <input
                className="w-full rounded-lg border border-gray-3 bg-gray-1 px-5 py-3"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                required
                type="email"
                value={form.email}
              />
              <input
                className="w-full rounded-lg border border-gray-3 bg-gray-1 px-5 py-3"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Password"
                required
                type="password"
                value={form.password}
              />
              <button
                className="w-full rounded-lg bg-surface-inverse py-3 text-white disabled:opacity-50"
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Creating account..." : "Create account"}
              </button>
              <p className="text-center">
                Already have an account?{" "}
                <Link className="text-content-brand" href="/signin">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default Signup;
