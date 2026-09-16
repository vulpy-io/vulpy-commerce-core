import Image from "next/image";
import { useState } from "react";

const PaymentMethod = () => {
  const [payment, setPayment] = useState("bank");
  return (
    <div className="mt-7.5 rounded-panel bg-white shadow-1">
      <div className="border-gray-3 border-b px-4 py-5 sm:px-8.5">
        <h3 className="font-semibold text-content-primary text-xl">Payment method</h3>
      </div>

      <div className="p-4 sm:p-8.5">
        <div className="flex flex-col gap-3">
          <label
            className="flex cursor-pointer select-none items-center gap-4"
            htmlFor="bank"
          >
            <div className="relative">
              <input
                className="sr-only"
                id="bank"
                name="bank"
                onChange={() => setPayment("bank")}
                type="checkbox"
              />
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  payment === "bank"
                    ? "border-4 border-action-primary-background"
                    : "border border-gray-4"
                }`}
              />
            </div>

            <div
              className={`rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none ${
                payment === "bank"
                  ? "border-transparent bg-gray-2"
                  : "border-gray-4 shadow-1"
              }`}
            >
              <div className="flex items-center">
                <div className="pr-2.5">
                  <Image alt="bank" height={12} src="/images/checkout/bank.svg" width={29}/>
                </div>

                <div className="border-gray-4 border-l pl-2.5">
                  <p>Direct bank transfer</p>
                </div>
              </div>
            </div>
          </label>

          <label
            className="flex cursor-pointer select-none items-center gap-4"
            htmlFor="cash"
          >
            <div className="relative">
              <input
                className="sr-only"
                id="cash"
                name="cash"
                onChange={() => setPayment("cash")}
                type="checkbox"
              />
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  payment === "cash"
                    ? "border-4 border-action-primary-background"
                    : "border border-gray-4"
                }`}
              />
            </div>

            <div
              className={`min-w-[240px] rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none ${
                payment === "cash"
                  ? "border-transparent bg-gray-2"
                  : "border-gray-4 shadow-1"
              }`}
            >
              <div className="flex items-center">
                <div className="pr-2.5">
                  <Image alt="cash" height={21} src="/images/checkout/cash.svg" width={21} />
                </div>

                <div className="border-gray-4 border-l pl-2.5">
                  <p>Cash on delivery</p>
                </div>
              </div>
            </div>
          </label>

          <label
            className="flex cursor-pointer select-none items-center gap-4"
            htmlFor="paypal"
          >
            <div className="relative">
              <input
                className="sr-only"
                id="paypal"
                name="paypal"
                onChange={() => setPayment("paypal")}
                type="checkbox"
              />
              <div
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  payment === "paypal"
                    ? "border-4 border-action-primary-background"
                    : "border border-gray-4"
                }`}
              />
            </div>
            <div
              className={`min-w-[240px] rounded-md border-[0.5px] px-5 py-3.5 duration-200 ease-out hover:border-transparent hover:bg-gray-2 hover:shadow-none ${
                payment === "paypal"
                  ? "border-transparent bg-gray-2"
                  : "border-gray-4 shadow-1"
              }`}
            >
              <div className="flex items-center">
                <div className="pr-2.5">
                  <Image alt="paypal" height={20} src="/images/checkout/paypal.svg" width={75}/>
                </div>

                <div className="border-gray-4 border-l pl-2.5">
                  <p>PayPal</p>
                </div>
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethod;
