export default function ProductQuantityStepper({
  quantity,
  onDecrease,
  onIncrease,
  max,
  size = "md",
  disabled = false,
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  max?: number;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  const buttonSize = size === "lg" ? "h-10 w-10" : "h-12 w-12";
  const qtyWidth = size === "lg" ? "w-20" : "w-16";

  const atMax = max !== undefined && quantity >= max;

  return (
    <div className="flex items-center rounded-md border border-gray-3">
      <button
        aria-label="Decrease quantity"
        className={`flex ${buttonSize} items-center justify-center duration-200 ease-out hover:text-content-brand disabled:opacity-50`}
        disabled={disabled || quantity <= 1}
        onClick={onDecrease}
        type="button"
      >
        <svg
          className="fill-current"
          fill="none"
          height="20"
          viewBox="0 0 20 20"
          width="20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.33301 10.0001C3.33301 9.53984 3.7061 9.16675 4.16634 9.16675H15.833C16.2932 9.16675 16.6663 9.53984 16.6663 10.0001C16.6663 10.4603 16.2932 10.8334 15.833 10.8334H4.16634C3.7061 10.8334 3.33301 10.4603 3.33301 10.0001Z"
            fill=""
          />
        </svg>
      </button>
      <span
        className={`flex ${buttonSize} ${qtyWidth} items-center justify-center border-gray-4 border-x font-semibold text-content-primary`}
      >
        {quantity}
      </span>
      <button
        aria-label="Increase quantity"
        className={`flex ${buttonSize} items-center justify-center duration-200 ease-out hover:text-content-brand disabled:opacity-50`}
        disabled={disabled || atMax}
        onClick={onIncrease}
        type="button"
      >
        <svg
          className="fill-current"
          fill="none"
          height="20"
          viewBox="0 0 20 20"
          width="20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.33301 10C3.33301 9.5398 3.7061 9.16671 4.16634 9.16671H15.833C16.2932 9.16671 16.6663 9.5398 16.6663 10C16.6663 10.4603 16.2932 10.8334 15.833 10.8334H4.16634C3.7061 10.8334 3.33301 10.4603 3.33301 10Z"
            fill=""
          />
          <path
            d="M9.99967 16.6667C9.53944 16.6667 9.16634 16.2936 9.16634 15.8334L9.16634 4.16671C9.16634 3.70647 9.53944 3.33337 9.99967 3.33337C10.4599 3.33337 10.833 3.70647 10.833 4.16671L10.833 15.8334C10.833 16.2936 10.4599 16.6667 9.99967 16.6667Z"
            fill=""
          />
        </svg>
      </button>
    </div>
  );
}
