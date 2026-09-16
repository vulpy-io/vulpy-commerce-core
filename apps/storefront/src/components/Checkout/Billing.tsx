"use client";

import type { HttpTypes } from "@medusajs/types";
import config from "@/config";
import type { CheckoutAddressForm } from "./CheckoutSteps";
import { isUsCountry, US_STATES } from "./us-states";

const INPUT_CLASS =
  "w-full rounded-md border border-gray-3 bg-gray-1 px-5 py-2.5 outline-none duration-200 placeholder:text-content-muted focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20";

const CHEVRON = (
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
);

export interface BillingProps {
  billingForm: CheckoutAddressForm;
  onBillingFormChange: (form: CheckoutAddressForm) => void;
  onSameAsShippingChange: (same: boolean) => void;
  regionCountries?: HttpTypes.StoreRegionCountry[];
  sameAsShipping: boolean;
}

/**
 * Billing address section for the checkout flow.
 *
 * Default state: "Bill to a different address?" toggle is OFF (sameAsShipping=true)
 * so the billing address form is hidden and the shipping address is reused.
 *
 * When the toggle is turned ON (sameAsShipping=false) the full address form is
 * shown and the data is passed up via onBillingFormChange.
 */
const Billing = ({
  billingForm,
  onBillingFormChange,
  onSameAsShippingChange,
  regionCountries,
  sameAsShipping,
}: BillingProps) => {
  const billDifferent = !sameAsShipping;

  return (
    <div className="mt-9">
      <h3 className="h3 mb-5.5">
        Billing details
      </h3>

      <div className="rounded-panel bg-white p-4 shadow-1 sm:p-8.5">
        {/* Toggle */}
        <div className="mb-5">
          <label
            className="flex cursor-pointer select-none items-center text-content-primary"
            htmlFor="billDifferentAddress"
          >
            <input
              checked={billDifferent}
              className="mr-2 h-4 w-4"
              id="billDifferentAddress"
              onChange={(e) => onSameAsShippingChange(!e.target.checked)}
              type="checkbox"
            />
            Bill to a different address?
          </label>
        </div>

        {/* Full form — shown only when billDifferent is true */}
        {billDifferent ? (
          <div>
            {/* First name + Last name */}
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2.5 block" htmlFor="billing-firstName">
                  First name <span className="text-status-danger">*</span>
                </label>
                <input
                  className={INPUT_CLASS}
                  id="billing-firstName"
                  onChange={(e) =>
                    onBillingFormChange({
                      ...billingForm,
                      first_name: e.target.value,
                    })
                  }
                  placeholder="Anna"
                  required
                  value={billingForm.first_name}
                />
              </div>
              <div>
                <label className="mb-2.5 block" htmlFor="billing-lastName">
                  Last name <span className="text-status-danger">*</span>
                </label>
                <input
                  className={INPUT_CLASS}
                  id="billing-lastName"
                  onChange={(e) =>
                    onBillingFormChange({
                      ...billingForm,
                      last_name: e.target.value,
                    })
                  }
                  placeholder="Korhonen"
                  required
                  value={billingForm.last_name}
                />
              </div>
            </div>

            {/* Company (optional) */}
            <div className="mb-5">
              <label className="mb-2.5 block" htmlFor="billing-company">
                Company (optional)
              </label>
              <input
                className={INPUT_CLASS}
                id="billing-company"
                onChange={(e) =>
                  onBillingFormChange({
                    ...billingForm,
                    company: e.target.value,
                  })
                }
                placeholder="Your company (optional)"
                value={billingForm.company}
              />
            </div>

            {/* Address line 1 */}
            <div className="mb-5">
              <label className="mb-2.5 block" htmlFor="billing-address1">
                Address <span className="text-status-danger">*</span>
              </label>
              <input
                className={INPUT_CLASS}
                id="billing-address1"
                onChange={(e) =>
                  onBillingFormChange({
                    ...billingForm,
                    address_1: e.target.value,
                  })
                }
                placeholder="House number and street name"
                required
                value={billingForm.address_1}
              />
            </div>

            {/* Address line 2 */}
            <div className="mb-5">
              <label className="mb-2.5 block" htmlFor="billing-address2">
                Apartment, suite, etc.{" "}
                <span className="text-content-muted">(optional)</span>
              </label>
              <input
                className={INPUT_CLASS}
                id="billing-address2"
                onChange={(e) =>
                  onBillingFormChange({
                    ...billingForm,
                    address_2: e.target.value,
                  })
                }
                placeholder="Apartment, suite, unit, etc. (optional)"
                value={billingForm.address_2}
              />
            </div>

            {/* City + Postal code */}
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2.5 block" htmlFor="billing-city">
                  City <span className="text-status-danger">*</span>
                </label>
                <input
                  className={INPUT_CLASS}
                  id="billing-city"
                  onChange={(e) =>
                    onBillingFormChange({
                      ...billingForm,
                      city: e.target.value,
                    })
                  }
                  required
                  value={billingForm.city}
                />
              </div>
              <div>
                <label className="mb-2.5 block" htmlFor="billing-postalCode">
                  Postal code <span className="text-status-danger">*</span>
                </label>
                <input
                  className={INPUT_CLASS}
                  id="billing-postalCode"
                  onChange={(e) =>
                    onBillingFormChange({
                      ...billingForm,
                      postal_code: e.target.value,
                    })
                  }
                  required
                  value={billingForm.postal_code}
                />
              </div>
            </div>

            {/* State/Province + Country */}
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2.5 block" htmlFor="billing-province">
                  {isUsCountry(billingForm.country_code) ? "State" : "State / Province"}
                  {isUsCountry(billingForm.country_code) ? (
                    <span className="text-status-danger"> *</span>
                  ) : null}
                </label>
                {isUsCountry(billingForm.country_code) ? (
                  <select
                    className="w-full appearance-none rounded-md border border-gray-3 bg-gray-1 py-2.5 pr-9 pl-5 text-content-primary outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
                    id="billing-province"
                    onChange={(e) =>
                      onBillingFormChange({
                        ...billingForm,
                        province: e.target.value,
                      })
                    }
                    required
                    value={billingForm.province}
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
                    className={INPUT_CLASS}
                    id="billing-province"
                    onChange={(e) =>
                      onBillingFormChange({
                        ...billingForm,
                        province: e.target.value,
                      })
                    }
                    placeholder={isUsCountry(billingForm.country_code) ? "State" : "State / Province"}
                    value={billingForm.province}
                  />
                )}
              </div>
              <div>
                <label className="mb-2.5 block" htmlFor="billing-countryCode">
                  Country <span className="text-status-danger">*</span>
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-md border border-gray-3 bg-gray-1 py-2.5 pr-9 pl-5 text-content-primary outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-focus-ring/20"
                    id="billing-countryCode"
                    onChange={(e) =>
                      onBillingFormChange({
                        ...billingForm,
                        country_code: e.target.value,
                      })
                    }
                    value={billingForm.country_code}
                  >
                    {regionCountries?.length
                      ? regionCountries.map((c) => (
                          <option key={c.iso_2} value={c.iso_2}>{c.display_name}</option>
                        ))
                      : <option value={config.defaultCountryCode}>{config.defaultCountryCode.toUpperCase()}</option>
                    }
                  </select>
                  {CHEVRON}
                </div>
              </div>
            </div>

            {/* Phone */}
            <div className="mb-5">
              <label className="mb-2.5 block" htmlFor="billing-phone">
                Phone <span className="text-status-danger">*</span>
              </label>
              <input
                className={INPUT_CLASS}
                id="billing-phone"
                onChange={(e) =>
                  onBillingFormChange({
                    ...billingForm,
                    phone: e.target.value,
                  })
                }
                required
                type="tel"
                value={billingForm.phone}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Billing;
