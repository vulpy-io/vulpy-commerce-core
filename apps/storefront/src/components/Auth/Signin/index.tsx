"use client";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import Link from "next/link";
import { useTransition } from "react";
import toast from "react-hot-toast";
import { loginCustomerAction } from "@/app/actions/customer";
import { CustomerLoginForm } from "@/components/Auth/CustomerLoginForm";
import PageLayout from "@/components/Common/PageLayout";
import type { CmsSiteSettings } from "@/lib/cms/types";

const Signin = ({ authLabels }: { authLabels: CmsSiteSettings["authLabels"] }) => {
  const [isPending, startTransition] = useTransition();

  const handleLogin = (email: string, password: string) => {
    startTransition(async () => {
      try {
        await loginCustomerAction(email, password);
      } catch (error) {
        if (isRedirectError(error)) {
          throw error;
        }
        toast.error("Invalid email or password");
      }
    });
  };

  return (
    <PageLayout title="Sign in">
      <section className="overflow-hidden bg-gray-2 py-20">
        <div className="container w-full">
          <div className="mx-auto w-full max-w-[570px] rounded-xl bg-white p-4 shadow-1 sm:p-7.5 xl:p-11">
            <div className="mb-11 text-center">
              <h3 className="h3 mb-1.5 xl:text-heading-5">
                {authLabels.signInTitle}
              </h3>
              <p>{authLabels.signInSubtitle}</p>
            </div>

            <CustomerLoginForm isPending={isPending} onSubmit={handleLogin} />

            <p className="mt-6 text-center">
              Don&apos;t have an account?
              <Link
                className="pl-2 text-content-primary hover:text-content-brand"
                href="/signup"
              >
                Register now
              </Link>
            </p>
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default Signin;
