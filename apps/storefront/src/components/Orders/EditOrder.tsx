import { useState } from "react";
import toast from "react-hot-toast";

const EditOrder = ({ order, toggleModal }: any) => {
  const [currentStatus, setCurrentStatus] = useState(order?.status);
  const handleChanege = (e: any) => {
    setCurrentStatus(e.target.value);
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();

    if (!currentStatus) {
      toast.error("Please select a status");
      return;
    }

    toggleModal(false);
  };

  return (
    <div className="w-full px-10">
      <p className="pb-2 font-semibold text-content-primary">Order status</p>
      <div className="w-full">
        <select
          className="w-full rounded-panel border border-gray-3 bg-gray-1 px-5 py-3.5 text-content-primary text-custom-sm"
          id="status"
          name="status"
          onChange={handleChanege}
          required
        >
          <option value="processing">Processing</option>
          <option value="on-hold">On hold</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <button
          className="mt-5 w-full rounded-panel bg-action-primary-background px-5 py-3.5 text-content-inverse text-custom-sm"
          onClick={handleSubmit}
        >
          Save changes
        </button>
      </div>
    </div>
  );
};

export default EditOrder;
