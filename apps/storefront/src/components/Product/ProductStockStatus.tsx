import { isVariantInStock } from "@/lib/medusa/stock";

export default function ProductStockStatus({
  inStock,
  className = "",
}: {
  inStock: boolean;
  className?: string;
}) {
  if (inStock) {
    return (
      <div className={`flex items-center gap-1.5 text-commerce-in-stock ${className}`}>
        <svg
          className="fill-current"
          fill="none"
          height="20"
          viewBox="0 0 20 20"
          width="20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g clipPath="url(#clip_in_stock)">
            <path
              d="M10 0.5625C4.78125 0.5625 0.5625 4.78125 0.5625 10C0.5625 15.2188 4.78125 19.4688 10 19.4688C15.2188 19.4688 19.4688 15.2188 19.4688 10C19.4688 4.78125 15.2188 0.5625 10 0.5625ZM10 18.0625C5.5625 18.0625 1.96875 14.4375 1.96875 10C1.96875 5.5625 5.5625 1.96875 10 1.96875C14.4375 1.96875 18.0625 5.59375 18.0625 10.0312C18.0625 14.4375 14.4375 18.0625 10 18.0625Z"
              fill="currentColor"
            />
            <path
              d="M12.6875 7.09374L8.9688 10.7187L7.2813 9.06249C7.00005 8.78124 6.56255 8.81249 6.2813 9.06249C6.00005 9.34374 6.0313 9.78124 6.2813 10.0625L8.2813 12C8.4688 12.1875 8.7188 12.2812 8.9688 12.2812C9.2188 12.2812 9.4688 12.1875 9.6563 12L13.6875 8.12499C13.9688 7.84374 13.9688 7.40624 13.6875 7.12499C13.4063 6.84374 12.9688 6.84374 12.6875 7.09374Z"
              fill="currentColor"
            />
          </g>
          <defs>
            <clipPath id="clip_in_stock">
              <rect fill="white" height="20" width="20" />
            </clipPath>
          </defs>
        </svg>
        <span className="font-semibold text-content-primary">In stock</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 text-status-danger ${className}`}>
      <svg
        className="fill-current"
        fill="none"
        height="20"
        viewBox="0 0 20 20"
        width="20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9.99935 14.7917C10.3445 14.7917 10.6243 14.5119 10.6243 14.1667V9.16669C10.6243 8.82151 10.3445 8.54169 9.99935 8.54169C9.65417 8.54169 9.37435 8.82151 9.37435 9.16669V14.1667C9.37435 14.5119 9.65417 14.7917 9.99935 14.7917Z"
          fill="currentColor"
        />
        <path
          d="M9.99935 5.83335C10.4596 5.83335 10.8327 6.20645 10.8327 6.66669C10.8327 7.12692 10.4596 7.50002 9.99935 7.50002C9.53911 7.50002 9.16602 7.12692 9.16602 6.66669C9.16602 6.20645 9.53911 5.83335 9.99935 5.83335Z"
          fill="currentColor"
        />
        <path
          clipRule="evenodd"
          d="M1.04102 10C1.04102 5.05247 5.0518 1.04169 9.99935 1.04169C14.9469 1.04169 18.9577 5.05247 18.9577 10C18.9577 14.9476 14.9469 18.9584 9.99935 18.9584C5.0518 18.9584 1.04102 14.9476 1.04102 10ZM9.99935 2.29169C5.74215 2.29169 2.29102 5.74283 2.29102 10C2.29102 14.2572 5.74215 17.7084 9.99935 17.7084C14.2565 17.7084 17.7077 14.2572 17.7077 10C17.7077 5.74283 14.2565 2.29169 9.99935 2.29169Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
      <span className="text-status-danger">Out of stock</span>
    </div>
  );
}

export { isVariantInStock };
