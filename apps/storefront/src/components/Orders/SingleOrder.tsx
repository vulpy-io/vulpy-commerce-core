"use client";

import type { HttpTypes } from "@medusajs/types";
import { useState } from "react";
import GatedAmount from "@/components/Product/GatedAmount";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { fromMedusaAmount } from "@/lib/medusa/money";
import OrderActions from "./OrderActions";
import OrderModal from "./OrderModal";
import {
  formatOrderDate,
  getOrderStatusClass,
  translateOrderStatus,
} from "./order-utils";

const SingleOrder = ({
  order,
  smallView,
}: {
  order: HttpTypes.StoreOrder;
  smallView: boolean;
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const storeCurrency = useStoreCurrency();
  const currency = order.currency_code ?? storeCurrency;
  const totalAmount = fromMedusaAmount(order.total, currency);

  const toggleDetails = () => {
    setShowDetails((open) => !open);
  };

  const toggleModal = (status: boolean) => {
    setShowDetails(status);
  };

  return (
    <>
      {!smallView && (
        <div className="hidden items-center justify-between border-gray-3 border-t px-7.5 py-5 md:flex">
          <div className="min-w-[111px]">
            <p className="text-custom-sm text-status-danger">#{order.id.slice(-8)}</p>
          </div>
          <div className="min-w-[175px]">
            <p className="text-content-primary text-custom-sm">
              {formatOrderDate(order.created_at)}
            </p>
          </div>

          <div className="min-w-[128px]">
            <p
              className={`inline-block rounded-badge px-2.5 py-0.5 text-custom-sm capitalize ${getOrderStatusClass(order.status)}`}
            >
              {translateOrderStatus(order.status)}
            </p>
          </div>

          <div className="min-w-[213px]">
            <p className="text-content-primary text-custom-sm">#{order.display_id}</p>
          </div>

          <div className="min-w-[113px]">
            <p className="text-content-primary text-custom-sm">
              <GatedAmount
                amount={totalAmount}
                className="text-content-primary text-custom-sm"
                currency={currency}
              />
            </p>
          </div>

          <div className="flex items-center gap-5">
            <OrderActions toggleDetails={toggleDetails} />
          </div>
        </div>
      )}

      {smallView && (
        <div className="block md:hidden">
          <div className="px-7.5 py-4.5">
            <p className="text-content-primary text-custom-sm">
              <span className="pr-2 font-bold">Order:</span> #{order.id.slice(-8)}
            </p>
            <p className="text-content-primary text-custom-sm">
              <span className="pr-2 font-bold">Date:</span>{" "}
              {formatOrderDate(order.created_at)}
            </p>
            <p className="text-content-primary text-custom-sm">
              <span className="pr-2 font-bold">Status:</span>{" "}
              <span
                className={`inline-block rounded-badge px-2.5 py-0.5 text-custom-sm capitalize ${getOrderStatusClass(order.status)}`}
              >
                {translateOrderStatus(order.status)}
              </span>
            </p>
            <p className="text-content-primary text-custom-sm">
              <span className="pr-2 font-bold">Order number:</span> #
              {order.display_id}
            </p>
            <p className="text-content-primary text-custom-sm">
              <span className="pr-2 font-bold">Total:</span>{" "}
              <GatedAmount
                amount={totalAmount}
                className="text-content-primary text-custom-sm"
                currency={currency}
              />
            </p>
            <p className="flex items-center text-content-primary text-custom-sm">
              <span className="pr-2 font-bold">Actions:</span>{" "}
              <OrderActions toggleDetails={toggleDetails} />
            </p>
          </div>
        </div>
      )}

      <OrderModal
        order={order}
        showDetails={showDetails}
        toggleModal={toggleModal}
      />
    </>
  );
};

export default SingleOrder;
