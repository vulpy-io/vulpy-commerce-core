import type { HttpTypes } from "@medusajs/types";
import OrderDetails from "./OrderDetails";

const OrderModal = ({
  order,
  showDetails,
  toggleModal,
}: {
  order: HttpTypes.StoreOrder;
  showDetails: boolean;
  toggleModal: (status: boolean) => void;
}) => {
  if (!showDetails) {
    return null;
  }

  return (
    <div className="backdrop-filter-sm visible fixed top-0 left-0 z-99999 flex min-h-dvh w-full items-center justify-center bg-[#000]/40 px-4 py-8 sm:px-8">
      <div className="relative flex w-full max-w-[600px] scale-100 transform flex-col rounded-panel bg-white shadow-7 transition-all">
        <button
          className="absolute -top-6 -right-6 z-9999 flex h-11.5 w-11.5 items-center justify-center rounded-full border-2 border-stroke bg-white text-body hover:text-content-primary"
          onClick={() => toggleModal(false)}
          type="button"
        >
          <svg
            fill="none"
            height="24"
            viewBox="0 0 25 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.9983 10.586L17.9483 5.63603L19.3623 7.05003L14.4123 12L19.3623 16.95L17.9483 18.364L12.9983 13.414L8.04828 18.364L6.63428 16.95L11.5843 12L6.63428 7.05003L8.04828 5.63603L12.9983 10.586Z"
              fill="currentColor"
            />
          </svg>
        </button>

        <OrderDetails order={order} />
      </div>
    </div>
  );
};

export default OrderModal;
