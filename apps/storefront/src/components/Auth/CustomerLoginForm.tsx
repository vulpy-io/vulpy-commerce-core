"use client";

import { useState } from "react";

type CustomerLoginFormProps = {
  emailId?: string;
  emailLabel?: string;
  isPending?: boolean;
  onSubmit: (email: string, password: string) => void;
  passwordId?: string;
  submitLabel?: string;
  variant?: "checkout" | "page";
};

const inputClassName = {
  checkout:
    "w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20",
  page: "w-full rounded-lg border border-gray-3 bg-gray-1 px-5 py-3 outline-none placeholder:text-content-muted focus:ring-2 focus:ring-focus-ring/20",
} as const;

const buttonClassName = {
  checkout:
    "inline-flex rounded-md bg-action-primary-background px-10.5 py-3 font-semibold text-white duration-200 ease-out hover:bg-action-primary-hover disabled:opacity-50",
  page: "mt-7.5 flex w-full justify-center rounded-lg bg-surface-inverse px-6 py-3 font-semibold text-white hover:bg-action-primary-background disabled:opacity-50",
} as const;

export function CustomerLoginForm({
  emailId = "email",
  emailLabel = "Email",
  isPending = false,
  onSubmit,
  passwordId = "password",
  submitLabel = "Sign in",
  variant = "page",
}: CustomerLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isEmbedded = variant === "checkout";
  const Wrapper = isEmbedded ? "div" : "form";

  const handleSubmit = (event?: React.SyntheticEvent) => {
    event?.preventDefault();

    if (isEmbedded && (!(email.trim() && password))) {
      return;
    }

    onSubmit(email, password);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isEmbedded && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Wrapper onSubmit={isEmbedded ? undefined : handleSubmit}>
      <div className="mb-5">
        <label className="mb-2.5 block" htmlFor={emailId}>
          {emailLabel}
        </label>
        <input
          className={inputClassName[variant]}
          id={emailId}
          name={emailId}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={variant === "page" ? "Enter your email" : undefined}
          required={!isEmbedded}
          type="email"
          value={email}
        />
      </div>

      <div className="mb-5">
        <label className="mb-2.5 block" htmlFor={passwordId}>
          Password
        </label>
        <input
          autoComplete="on"
          className={inputClassName[variant]}
          id={passwordId}
          name={passwordId}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={variant === "page" ? "Enter your password" : undefined}
          required={!isEmbedded}
          type="password"
          value={password}
        />
      </div>

      <button
        className={buttonClassName[variant]}
        disabled={isPending}
        onClick={isEmbedded ? handleSubmit : undefined}
        type={isEmbedded ? "button" : "submit"}
      >
        {isPending ? "Signing in..." : submitLabel}
      </button>
    </Wrapper>
  );
}
