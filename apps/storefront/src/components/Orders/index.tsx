"use client";

import type { HttpTypes } from "@medusajs/types";
import SingleOrder from "./SingleOrder";

const Orders = ({ orders }: { orders: HttpTypes.StoreOrder[] }) => {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[770px]">
        {orders.length > 0 ? (
          <div className="hidden items-center justify-between px-7.5 py-4.5 md:flex">
            <div className="min-w-[111px]">
              <p className="text-content-primary text-custom-sm">Order</p>
            </div>
            <div className="min-w-[175px]">
              <p className="text-content-primary text-custom-sm">Date</p>
            </div>
            <div className="min-w-[128px]">
              <p className="text-content-primary text-custom-sm">Status</p>
            </div>
            <div className="min-w-[213px]">
              <p className="text-content-primary text-custom-sm">Order number</p>
            </div>
            <div className="min-w-[113px]">
              <p className="text-content-primary text-custom-sm">Total</p>
            </div>
            <div className="min-w-[113px]">
              <p className="text-content-primary text-custom-sm">Action</p>
            </div>
          </div>
        ) : null}

        {orders.length > 0 ? (
          orders.map((order) => (
            <SingleOrder key={order.id} order={order} smallView={false} />
          ))
        ) : (
          <p className="px-4 py-9.5 sm:px-7.5 xl:px-10">
            You don't have any orders yet.
          </p>
        )}
      </div>

      {orders.length > 0
        ? orders.map((order) => (
            <SingleOrder key={`${order.id}-mobile`} order={order} smallView />
          ))
        : null}
    </div>
  );
};

export default Orders;
