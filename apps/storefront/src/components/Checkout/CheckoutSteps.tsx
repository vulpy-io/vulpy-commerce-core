"use client";

import type { HttpTypes } from "@medusajs/types";
import { PaymentElement } from "@stripe/react-stripe-js";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { loginCustomerAction } from "@/app/actions/customer";
import { CustomerLoginForm } from "@/components/Auth/CustomerLoginForm";
import PaymentMethodIcons from "@/components/Common/PaymentMethodIcons";
import GatedAmount from "@/components/Product/GatedAmount";
import config from "@/config";
import type { CmsPaymentMethod } from "@/lib/cms/types";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveMedusaAssetUrlOrFallback } from "@/lib/medusa/asset-url";
import {
  getCartGrandTotal,
  getCartItemsSubtotal,
  getCartShippingTotal,
} from "@/lib/medusa/cart-totals";
import { fromMedusaAmount } from "@/lib/medusa/money";
import { formatCartLineItemOptions } from "@/lib/medusa/product-options";
import { isUsCountry, US_STATES } from "./us-states";
export type CheckoutAddressForm = {
  email: string;
  first_name: string;
  last_name: string;
  /** Optional company name stored in Medusa address.company */
  company: string;
  phone: string;
  address_1: string;
  address_2: string;
  city: string;
  postal_code: string;
  province: string;
  country_code: string;
};

import { getPaymentProviderLabel } from "@/lib/medusa/payment-providers";
export function CheckoutSecurePaymentNote() {
  return (
    <p className="mt-3 flex items-center justify-center gap-2 text-content-muted text-custom-sm">
      <svg
        aria-hidden
        className="shrink-0 text-content-muted"
        fill="none"
        height="16"
        viewBox="0 0 16 16"
        width="16"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 1.33325L2.66667 3.33325V7.33325C2.66667 10.3533 4.58 13.1133 8 14.6666C11.42 13.1133 13.3333 10.3533 13.3333 7.33325V3.33325L8 1.33325ZM8 8.66659C7.26362 8.66659 6.66667 8.06964 6.66667 7.33325C6.66667 6.59687 7.26362 5.99992 8 5.99992C8.73638 5.99992 9.33333 6.59687 9.33333 7.33325C9.33333 8.06964 8.73638 8.66659 8 8.66659Z"
          fill="currentColor"
        />
      </svg>
      Secure payment
    </p>
  );
}

export function CheckoutLoginPanel({
  customerEmail,
}: {
  customerEmail?: string | null;
}) {
  const [dropdown, setDropdown] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (customerEmail) {
    return (
      <div className="mb-9 rounded-panel bg-white p-5 shadow-1">
        <p className="text-content-primary">
          Signed in as{" "}
          <span className="font-semibold">{customerEmail}</span>
        </p>
      </div>
    );
  }

  const handleLogin = (email: string, password: string) => {
    startTransition(async () => {
      try {
        await loginCustomerAction(email, password, "/checkout");
      } catch (error) {
        if (isRedirectError(error)) {
          throw error;
        }
        toast.error("Invalid email or password");
      }
    });
  };

  return (
    <div className="mb-9 rounded-panel bg-white shadow-1">
      <button
        className={`flex w-full cursor-pointer items-center gap-0.5 px-5.5 py-5 text-left ${
          dropdown ? "border-gray-3 border-b" : ""
        }`}
        onClick={() => setDropdown((open) => !open)}
        type="button"
      >
        Returning customer?
        <span className="flex items-center gap-2.5 pl-1 font-semibold text-content-primary">
          Click here to sign in
          <svg
            className={`fill-current duration-200 ease-out ${
              dropdown ? "rotate-180" : ""
            }`}
            fill="none"
            height="22"
            viewBox="0 0 22 22"
            width="22"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M4.06103 7.80259C4.30813 7.51431 4.74215 7.48092 5.03044 7.72802L10.9997 12.8445L16.9689 7.72802C17.2572 7.48092 17.6912 7.51431 17.9383 7.80259C18.1854 8.09088 18.1521 8.5249 17.8638 8.772L11.4471 14.272C11.1896 14.4927 10.8097 14.4927 10.5523 14.272L4.1356 8.772C3.84731 8.5249 3.81393 8.09088 4.06103 7.80259Z"
              fill=""
              fillRule="evenodd"
            />
          </svg>
        </span>
      </button>

      <div
        className={`${
          dropdown ? "block" : "hidden"
        } px-4 pt-7.5 pb-8.5 sm:px-8.5`}
      >
        <p className="mb-6 text-custom-sm">
          If you are not signed in, please sign in first.
        </p>

        <CustomerLoginForm
          emailId="checkout-email"
          emailLabel="Email"
          isPending={isPending}
          onSubmit={handleLogin}
          passwordId="checkout-password"
          submitLabel="Sign in"
          variant="checkout"
        />
      </div>
    </div>
  );
}

export function CheckoutNotesPanel({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (notes: string) => void;
}) {
  return (
    <div className="mt-7.5 rounded-panel bg-white p-4 shadow-1 sm:p-8.5">
      <label className="mb-2.5 block" htmlFor="checkout-notes">
        Order notes (optional)
      </label>
      <textarea
        className="w-full rounded-md border border-gray-3 bg-gray-1 p-5 outline-none placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
        id="checkout-notes"
        name="notes"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Notes about your order, e.g. special delivery instructions."
        rows={5}
        value={notes}
      />
      <p className="mt-2 text-content-muted text-custom-sm">
        Notes are shown here per the template. They will be sent with orders
        once order metadata saving is enabled.
      </p>
    </div>
  );
}

export function ShippingInformationStep({
  accountPassword,
  createAccount,
  form,
  onAccountPasswordChange,
  onChange,
  onCreateAccountChange,
  regionCountries,
  showCreateAccount = false,
}: {
  accountPassword?: string;
  createAccount?: boolean;
  form: CheckoutAddressForm;
  onAccountPasswordChange?: (password: string) => void;
  onChange: (form: CheckoutAddressForm) => void;
  onCreateAccountChange?: (createAccount: boolean) => void;
  regionCountries?: HttpTypes.StoreRegionCountry[];
  showCreateAccount?: boolean;
}) {
  return (
    <div>
      <h3 className="h3 mb-5.5">
        Contact details
      </h3>
      <div className="rounded-panel bg-white p-4 shadow-1 sm:p-8.5">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2.5 block" htmlFor="firstName">
            First name <span className="text-status-danger">*</span>
          </label>
          <input
            autoFocus
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="firstName"
            onChange={(e) => onChange({ ...form, first_name: e.target.value })}
            required
            value={form.first_name}
          />
        </div>
        <div>
          <label className="mb-2.5 block" htmlFor="lastName">
            Last name <span className="text-status-danger">*</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="lastName"
            onChange={(e) => onChange({ ...form, last_name: e.target.value })}
            required
            value={form.last_name}
          />
        </div>
      </div>
      <div className="mb-5">
        <label className="mb-2.5 block" htmlFor="company">
          Company (optional)
        </label>
        <input
          className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
          id="company"
          onChange={(e) => onChange({ ...form, company: e.target.value })}
          placeholder="Your company (optional)"
          value={form.company}
        />
      </div>
      <div className="mb-5">
        <label className="mb-2.5 block" htmlFor="address1">
          Address <span className="text-status-danger">*</span>
        </label>
        <input
          className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
          id="address1"
          onChange={(e) => onChange({ ...form, address_1: e.target.value })}
          required
          value={form.address_1}
        />
      </div>
      <div className="mb-5">
        <label className="mb-2.5 block" htmlFor="address2">
          Apartment, suite, etc. <span className="text-content-muted">(optional)</span>
        </label>
        <input
          className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
          id="address2"
          onChange={(e) => onChange({ ...form, address_2: e.target.value })}
          placeholder="Apartment, suite, unit, etc. (optional)"
          value={form.address_2}
        />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2.5 block" htmlFor="city">
            City <span className="text-status-danger">*</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="city"
            onChange={(e) => onChange({ ...form, city: e.target.value })}
            required
            value={form.city}
          />
        </div>
        <div>
          <label className="mb-2.5 block" htmlFor="postalCode">
            Postal code <span className="text-status-danger">*</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="postalCode"
            onChange={(e) => onChange({ ...form, postal_code: e.target.value })}
            required
            value={form.postal_code}
          />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2.5 block" htmlFor="province">
            {isUsCountry(form.country_code) ? "State" : "State / Province"}
            {isUsCountry(form.country_code) ? (
              <span className="text-status-danger"> *</span>
            ) : null}
          </label>
          {isUsCountry(form.country_code) ? (
            <select
              className="w-full appearance-none rounded-md border border-gray-3 bg-gray-1 py-2.5 pr-9 pl-5 text-content-primary outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="province"
              onChange={(e) => onChange({ ...form, province: e.target.value })}
              required
              value={form.province}
            >
              <option value="">Select a state</option>
              {US_STATES.map((state) => (
                <option key={state.value} value={state.label}>
                  {state.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="province"
              onChange={(e) => onChange({ ...form, province: e.target.value })}
              placeholder={isUsCountry(form.country_code) ? "State" : "State / Province"}
              value={form.province}
            />
          )}
        </div>
        <div>
          <label className="mb-2.5 block" htmlFor="countryCode">
            Country <span className="text-status-danger">*</span>
          </label>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-md border border-gray-3 bg-gray-1 py-2.5 pr-9 pl-5 text-content-primary outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="countryCode"
              onChange={(e) => onChange({ ...form, country_code: e.target.value })}
              value={form.country_code}
            >
              {regionCountries?.length
                ? regionCountries.map((c) => (
                    <option key={c.iso_2} value={c.iso_2}>{c.display_name}</option>
                  ))
                : <option value={config.defaultCountryCode}>{config.defaultCountryCode.toUpperCase()}</option>
              }
            </select>
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-content-muted">
              <svg aria-hidden className="fill-current" fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.41469 5.03569L2.41467 5.03571L2.41749 5.03846L7.76749 10.2635L8.0015 10.492L8.23442 10.2623L13.5844 4.98735L13.5844 4.98735L13.5861 4.98569C13.6809 4.89086 13.8199 4.89087 13.9147 4.98569C14.0092 5.08024 14.0095 5.21864 13.9155 5.31345C13.9152 5.31373 13.915 5.31401 13.9147 5.31429L8.16676 10.9622L8.16676 10.9622L8.16469 10.9643C8.06838 11.0606 8.02352 11.0667 8.00039 11.0667C7.94147 11.0667 7.89042 11.0522 7.82064 10.9991L2.08526 5.36345C1.99127 5.26865 1.99154 5.13024 2.08609 5.03569C2.18092 4.94086 2.31986 4.94086 2.41469 5.03569Z" fill="" stroke="" strokeWidth="0.666667" />
              </svg>
            </span>
          </div>
        </div>
      </div>
      <div className="mb-5">
        <label className="mb-2.5 block" htmlFor="phone">
          Phone <span className="text-status-danger">*</span>
        </label>
        <input
          className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
          id="phone"
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
          required
          type="tel"
          value={form.phone}
        />
      </div>
      <div className="mb-5.5">
        <label className="mb-2.5 block" htmlFor="email">
          Email <span className="text-status-danger">*</span>
        </label>
        <input
          className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
          id="email"
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          required
          type="email"
          value={form.email}
        />
      </div>
      {showCreateAccount ? (
        <div>
          <label
            className="flex cursor-pointer select-none items-center text-content-primary"
            htmlFor="createAccount"
          >
            <input
              checked={createAccount}
              className="mr-2 h-4 w-4"
              id="createAccount"
              onChange={(event) =>
                onCreateAccountChange?.(event.target.checked)
              }
              type="checkbox"
            />
            Create an account
          </label>
          {createAccount ? (
            <div className="mt-4">
              <label className="mb-2.5 block" htmlFor="accountPassword">
                Password <span className="text-status-danger">*</span>
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
                id="accountPassword"
                minLength={8}
                onChange={(event) =>
                  onAccountPasswordChange?.(event.target.value)
                }
                required
                type="password"
                value={accountPassword ?? ""}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}

export function DeliveryMethodStep({
  currency,
  onSelect,
  selectedShipping,
  shippingOptions,
}: {
  currency: string;
  onSelect: (id: string) => void;
  selectedShipping: string;
  shippingOptions: HttpTypes.StoreCartShippingOption[];
}) {
  return (
    <div className="mt-7.5 rounded-panel bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
        <h3 className="font-semibold text-content-primary text-xl">Delivery method</h3>
      </div>
      <div className="p-4 sm:p-8.5">
      <div className="flex flex-col gap-3">
      {shippingOptions.length > 0 ? (
        shippingOptions.map((option) => {
          const isSelected = selectedShipping === option.id;

          return (
          <label className="flex cursor-pointer select-none items-start gap-4" key={option.id}>
              <span className="relative mt-4">
                <input
                  checked={isSelected}
                  className="sr-only"
                  name="shipping"
                  onChange={() => onSelect(option.id)}
                  type="radio"
                  value={option.id}
                />
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full ${
                    isSelected
                      ? "border-4 border-action-primary-background"
                      : "border border-gray-4"
                  }`}
                />
              </span>
              <span
                className={`min-w-[240px] flex-1 rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none ${
                  isSelected
                    ? "border-transparent bg-gray-2"
                    : "border-gray-4 shadow-1"
                }`}
              >
                <span className="text-content-primary">
                  <span className="font-bold">
                    <GatedAmount
                      amount={fromMedusaAmount(option.amount, currency)}
                      className="font-bold text-content-primary"
                      currency={currency}
                    />
                  </span>
                  <span className="ml-3">{option.name}</span>
                </span>
              </span>
            </label>
          );
        })
      ) : (
        <p className="text-content-muted">Delivery options are not available yet.</p>
      )}
      </div>
      </div>
    </div>
  );
}

export function PaymentInformationStep({
  children,
  isStripe,
  onSelectPayment,
  paymentMethods,
  paymentProviders,
  paymentSession,
  paymentSessionReady,
  selectedPayment,
}: {
  children: ReactNode;
  isStripe: boolean;
  onSelectPayment: (id: string) => void;
  paymentMethods?: CmsPaymentMethod[];
  paymentProviders: HttpTypes.StorePaymentProvider[];
  paymentSession?: HttpTypes.StorePaymentSession;
  paymentSessionReady?: boolean;
  selectedPayment: string;
}) {
  return (
    <div className="mt-7.5 rounded-panel bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
        <h3 className="font-semibold text-content-primary text-xl">Payment method</h3>
      </div>
      <div className="p-4 sm:p-8.5">
      <div className="flex flex-col gap-3">
      {paymentProviders.map((provider) => {
        const isSelected = selectedPayment === provider.id;

        return (
        <label
          className="flex cursor-pointer select-none items-start gap-4"
          key={provider.id}
        >
          <span className="relative mt-4">
            <input
              checked={isSelected}
              className="sr-only"
              name="payment"
              onChange={() => onSelectPayment(provider.id)}
              type="radio"
              value={provider.id}
            />
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full ${
                isSelected
                  ? "border-4 border-action-primary-background"
                  : "border border-gray-4"
              }`}
            />
          </span>
          <span
            className={`min-w-[240px] flex-1 rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none ${
              isSelected
                ? "border-transparent bg-gray-2"
                : "border-gray-4 shadow-1"
            }`}
          >
            <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-content-primary">{getPaymentProviderLabel(provider.id)}</span>
              {provider.id.includes("stripe") ? (
                <PaymentMethodIcons
                  className="flex shrink-0 items-center gap-2 sm:justify-end"
                  paymentMethods={paymentMethods}
                />
              ) : null}
            </span>
            {isSelected && provider.id.includes("stripe") && paymentSessionReady ? (
              <div className="mt-4 rounded-md border border-gray-3 bg-white p-4">
                <PaymentElement />
                {children}
              </div>
            ) : null}
          </span>
        </label>
        );
      })}

      {(!(isStripe && paymentSessionReady)) && !paymentSession ? (
        <p className="mt-3 text-content-muted text-custom-sm">
          Payment will be initialized when you place your order.
        </p>
      ) : null}
      </div>
      </div>
    </div>
  );
}

export function CheckoutOrderSummary({
  cart,
  currency,
  selectedShippingOption,
  supportPhone,
}: {
  cart: HttpTypes.StoreCart;
  currency: string;
  selectedShippingOption?: HttpTypes.StoreCartShippingOption | null;
  supportPhone?: string;
}) {
  const subtotal = getCartItemsSubtotal(cart, currency);
  const shipping = getCartShippingTotal(cart, currency, selectedShippingOption);
  const tax = fromMedusaAmount(cart.tax_total, currency);
  const discount = fromMedusaAmount(cart.discount_total, currency);
  const total = getCartGrandTotal(cart, currency, subtotal, shipping);

  return (
    <div className="rounded-panel bg-white p-6 shadow-1">
      <h3 className="mb-4 font-semibold text-xl">Your order</h3>
      {cart.items?.map((item) => {
        const productHandle = item.product?.handle;
        const productUrl = productHandle
          ? `/products/${productHandle}`
          : "/shop";
        const thumbnail = resolveMedusaAssetUrlOrFallback(
          item.thumbnail,
          PRODUCT_PLACEHOLDER_IMAGE
        );

        return (
          <div className="flex justify-between border-gray-3 border-b py-2" key={item.id}>
            <div className="flex min-w-0 items-center gap-3 pr-3">
              <Link
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-panel bg-gray-3"
                href={productUrl}
              >
                <Image
                  alt={item.title ?? "product"}
                  className="h-full w-full object-cover"
                  height={56}
                  src={thumbnail}
                  width={56}
                />
              </Link>

              <div className="min-w-0">
                <Link
                  className="line-clamp-2 text-body hover:underline"
                  href={productUrl}
                >
                  {item.title}
                </Link>
                {(() => {
                  const attributes = formatCartLineItemOptions(item);
                  return attributes ? (
                    <p className="mt-1 text-content-muted text-custom-sm">{attributes}</p>
                  ) : null;
                })()}
                <p className="mt-1 text-content-muted text-custom-sm">
                  <GatedAmount
                    amount={fromMedusaAmount(item.unit_price, currency)}
                    className="text-content-muted text-custom-sm"
                    currency={currency}
                  />{" "}
                  x {item.quantity ?? 1}
                </p>
              </div>
            </div>
            <span>
              <GatedAmount
                amount={
                  fromMedusaAmount(item.unit_price, currency) * (item.quantity ?? 1)
                }
                currency={currency}
              />
            </span>
          </div>
        );
      })}
      <div className="flex justify-between py-2">
        <span>Subtotal</span>
        <GatedAmount amount={subtotal} currency={currency} />
      </div>
      <div className="flex justify-between py-2">
        <span>Shipping</span>
        <GatedAmount amount={shipping} currency={currency} />
      </div>
      {tax > 0 ? (
        <div className="flex justify-between py-2">
          <span>Tax</span>
          <GatedAmount amount={tax} currency={currency} />
        </div>
      ) : null}
      {discount > 0 ? (
        <div className="flex justify-between py-2 text-green">
          <span>Discount</span>
          <span className="inline-flex items-center gap-0.5 text-green">
            -
            <GatedAmount
              amount={discount}
              className="text-green"
              currency={currency}
            />
          </span>
        </div>
      ) : null}
      <div className="flex justify-between pt-4 font-semibold text-lg">
        <span>Total</span>
        <GatedAmount
          amount={total}
          className="font-semibold text-content-primary text-lg"
          currency={currency}
        />
      </div>
      <div className="mt-5 rounded-md bg-gray-1 p-4 text-content-muted text-custom-sm">
        {supportPhone ? (
          <p className="mb-3 flex items-center gap-2">
            <svg
              aria-hidden
              className="shrink-0 text-content-muted"
              fill="none"
              height="16"
              viewBox="0 0 16 16"
              width="16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3.654 1.328a.75.75 0 0 1 .78-.085l2.5 1a.75.75 0 0 1 .454.69v1.027c0 .27-.145.52-.38.655l-1.12.672a9.02 9.02 0 0 0 3.658 3.658l.672-1.12a.75.75 0 0 1 .655-.38h1.027a.75.75 0 0 1 .69.454l1 2.5a.75.75 0 0 1-.085.78l-1.25 1.25a1.25 1.25 0 0 1-1.31.293 11.5 11.5 0 0 1-5.4-3.45 11.5 11.5 0 0 1-3.45-5.4 1.25 1.25 0 0 1 .293-1.31l1.25-1.25Z"
                fill="currentColor"
              />
            </svg>
            <a className="text-body hover:underline" href={`tel:${supportPhone.replace(/\s/g, "")}`}>
              {supportPhone}
            </a>
          </p>
        ) : null}
        <p>
          Secure checkout. Need help? See our{" "}
          <Link className="text-body hover:underline" href="/faq">
            FAQ
          </Link>{" "}
          or{" "}
          <Link className="text-body hover:underline" href="/contact">
            contact support
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
