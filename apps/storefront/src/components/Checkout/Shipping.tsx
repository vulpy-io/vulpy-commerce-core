"use client";

import { useState } from "react";
import type { CheckoutAddressForm } from "./CheckoutSteps";

interface ShippingProps {
  form: CheckoutAddressForm;
  onChange: (form: CheckoutAddressForm) => void;
}

const Shipping = ({ form, onChange }: ShippingProps) => {
  const [dropdown, setDropdown] = useState(false);

  return (
    <div className="mt-7.5 rounded-panel bg-white shadow-1">
      <button
        className="flex w-full cursor-pointer items-center gap-2.5 px-5.5 py-5 font-semibold text-content-primary text-lg"
        onClick={() => setDropdown(!dropdown)}
        type="button"
      >
        Ship to a different address?
        <svg
          className={`fill-current duration-200 ease-out ${
            dropdown && "rotate-180"
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
      </button>

      <div className={`p-4 sm:p-8.5 ${dropdown ? "block" : "hidden"}`}>
        {/* First name / Last name */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2.5 block" htmlFor="ship-firstName">
              First name <span className="text-status-danger">*</span>
            </label>
            <input
              className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="ship-firstName"
              name="ship_first_name"
              onChange={(e) => onChange({ ...form, first_name: e.target.value })}
              placeholder="Anna"
              required
              value={form.first_name}
            />
          </div>
          <div>
            <label className="mb-2.5 block" htmlFor="ship-lastName">
              Last name <span className="text-status-danger">*</span>
            </label>
            <input
              className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="ship-lastName"
              name="ship_last_name"
              onChange={(e) => onChange({ ...form, last_name: e.target.value })}
              placeholder="Korhonen"
              required
              value={form.last_name}
            />
          </div>
        </div>

        {/* Company (optional) */}
        <div className="mb-5">
          <label className="mb-2.5 block" htmlFor="ship-company">
            Company (optional)
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="ship-company"
            name="ship_company"
            onChange={(e) => onChange({ ...form, company: e.target.value })}
            placeholder="Your company (optional)"
            value={form.company}
          />
        </div>

        {/* Address line 1 */}
        <div className="mb-5">
          <label className="mb-2.5 block" htmlFor="ship-address1">
            Address <span className="text-status-danger">*</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="ship-address1"
            name="ship_address_1"
            onChange={(e) => onChange({ ...form, address_1: e.target.value })}
            placeholder="House number and street name"
            required
            value={form.address_1}
          />
        </div>

        {/* Address line 2 (optional) */}
        <div className="mb-5">
          <label className="mb-2.5 block" htmlFor="ship-address2">
            Apartment, suite, etc.{" "}
            <span className="text-content-muted">(optional)</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="ship-address2"
            name="ship_address_2"
            onChange={(e) => onChange({ ...form, address_2: e.target.value })}
            placeholder="Apartment, suite, unit, etc. (optional)"
            value={form.address_2}
          />
        </div>

        {/* City / Postal code */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2.5 block" htmlFor="ship-city">
              City <span className="text-status-danger">*</span>
            </label>
            <input
              className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="ship-city"
              name="ship_city"
              onChange={(e) => onChange({ ...form, city: e.target.value })}
              required
              value={form.city}
            />
          </div>
          <div>
            <label className="mb-2.5 block" htmlFor="ship-postalCode">
              Postal code <span className="text-status-danger">*</span>
            </label>
            <input
              className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="ship-postalCode"
              name="ship_postal_code"
              onChange={(e) => onChange({ ...form, postal_code: e.target.value })}
              required
              value={form.postal_code}
            />
          </div>
        </div>

        {/* State/Province / Country */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2.5 block" htmlFor="ship-province">
              State / Province
            </label>
            <input
              className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
              id="ship-province"
              name="ship_province"
              onChange={(e) => onChange({ ...form, province: e.target.value })}
              value={form.province}
            />
          </div>
          <div>
            <label className="mb-2.5 block" htmlFor="ship-countryCode">
              Country <span className="text-status-danger">*</span>
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-md border border-gray-3 bg-gray-1 py-2.5 pr-9 pl-5 text-content-primary outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
                id="ship-countryCode"
                name="ship_country_code"
                onChange={(e) => onChange({ ...form, country_code: e.target.value })}
                value={form.country_code}
              >
                <option value="us">United States</option>
                <option value="gb">United Kingdom</option>
                <option value="de">Germany</option>
                <option value="fr">France</option>
                <option value="ca">Canada</option>
                <option value="au">Australia</option>
              </select>
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-content-muted">
                <svg
                  aria-hidden
                  className="fill-current"
                  fill="none"
                  height="16"
                  viewBox="0 0 16 16"
                  width="16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M2.41469 5.03569L2.41467 5.03571L2.41749 5.03846L7.76749 10.2635L8.0015 10.492L8.23442 10.2623L13.5844 4.98735L13.5844 4.98735L13.5861 4.98569C13.6809 4.89086 13.8199 4.89087 13.9147 4.98569C14.0092 5.08024 14.0095 5.21864 13.9155 5.31345C13.9152 5.31373 13.915 5.31401 13.9147 5.31429L8.16676 10.9622L8.16676 10.9622L8.16469 10.9643C8.06838 11.0606 8.02352 11.0667 8.00039 11.0667C7.94147 11.0667 7.89042 11.0522 7.82064 10.9991L2.08526 5.36345C1.99127 5.26865 1.99154 5.13024 2.08609 5.03569C2.18092 4.94086 2.31986 4.94086 2.41469 5.03569Z"
                    fill=""
                    stroke=""
                    strokeWidth="0.666667"
                  />
                </svg>
              </span>
            </div>
          </div>
        </div>

        {/* Phone (optional) */}
        <div className="mb-5">
          <label className="mb-2.5 block" htmlFor="ship-phone">
            Phone <span className="text-content-muted">(optional)</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
            id="ship-phone"
            name="ship_phone"
            onChange={(e) => onChange({ ...form, phone: e.target.value })}
            type="tel"
            value={form.phone}
          />
        </div>
      </div>
    </div>
  );
};

export default Shipping;
