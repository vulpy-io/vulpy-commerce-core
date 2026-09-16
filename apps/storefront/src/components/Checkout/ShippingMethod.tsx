import Image from "next/image";
import { useState } from "react";

const ShippingMethod = () => {
  const [shippingMethod, setShippingMethod] = useState("free");
  return (
    <div className="mt-7.5 rounded-panel bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
        <h3 className="font-semibold text-content-primary text-xl">Shipping method</h3>
      </div>

      <div className="p-4 sm:p-8.5">
        <div className="flex flex-col gap-4">
          <label
            className="flex cursor-pointer select-none items-center gap-3.5"
            htmlFor="free"
          >
            <div className="relative">
              <input
                className="sr-only"
                id="free"
                name="free"
                onChange={() => setShippingMethod("free")}
                type="checkbox"
              />
              {/* selectShipping === 'free' ? 'border-4 border-action-primary-background' : 'border border-gray-4' */}
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  shippingMethod === "free"
                    ? "border-4 border-action-primary-background"
                    : "border border-gray-4"
                }`}
              />
            </div>
            Free shipping
          </label>

          <label
            className="flex cursor-pointer select-none items-center gap-3.5"
            htmlFor="fedex"
          >
            <div className="relative">
              <input
                className="sr-only"
                id="fedex"
                name="fedex"
                onChange={() => setShippingMethod("fedex")}
                type="checkbox"
              />
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  shippingMethod === "fedex"
                    ? "border-4 border-action-primary-background"
                    : "border border-gray-4"
                }`}
              />
            </div>

            <div className="rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none">
              <div className="flex items-center">
                <div className="pr-4">
                  <Image
                    alt="fedex"
                    height={18}
                    src="/images/checkout/fedex.svg"
                    width={64}
                  />
                </div>

                <div className="border-gray-4 border-l pl-4">
                  <p className="font-bold text-content-primary">$10.99</p>
                  <p className="text-custom-xs">Standard delivery</p>
                </div>
              </div>
            </div>
          </label>

          <label
            className="flex cursor-pointer select-none items-center gap-3.5"
            htmlFor="dhl"
          >
            <div className="relative">
              <input
                className="sr-only"
                id="dhl"
                name="dhl"
                onChange={() => setShippingMethod("dhl")}
                type="checkbox"
              />
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  shippingMethod === "dhl"
                    ? "border-4 border-action-primary-background"
                    : "border border-gray-4"
                }`}
              />
            </div>

            <div className="rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none">
              <div className="flex items-center">
                <div className="pr-4">
                  <Image
                    alt="dhl"
                    height={20}
                    src="/images/checkout/dhl.svg"
                    width={64}
                  />
                </div>

                <div className="border-gray-4 border-l pl-4">
                  <p className="font-bold text-content-primary">$12.50</p>
                  <p className="text-custom-xs">Standard delivery</p>
                </div>
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default ShippingMethod;
