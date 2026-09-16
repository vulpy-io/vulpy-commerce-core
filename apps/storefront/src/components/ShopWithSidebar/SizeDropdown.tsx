"use client";

import { useState } from "react";

type SizeDropdownProps = {
  sizes: string[];
  selectedSizes: string[];
  onChange: (sizes: string[]) => void;
};

const SizeDropdown = ({ sizes, selectedSizes, onChange }: SizeDropdownProps) => {
  const [toggleDropdown, setToggleDropdown] = useState(true);

  const toggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      onChange(selectedSizes.filter((value) => value !== size));
      return;
    }
    onChange([...selectedSizes, size]);
  };

  if (sizes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-white shadow-1">
      <div
        className={`flex cursor-pointer items-center justify-between py-3 pr-5.5 pl-6 ${
          toggleDropdown && "shadow-filter"
        }`}
        onClick={() => setToggleDropdown(!toggleDropdown)}
      >
        <p className="font-bold text-[11px] text-content-primary uppercase tracking-[0.14em]">Size</p>
        <button
          aria-label="Expand sizes"
          className={`text-content-primary duration-200 ease-out ${
            toggleDropdown && "rotate-180"
          }`}
          onClick={() => setToggleDropdown(!toggleDropdown)}
          type="button"
        >
          <svg
            className="fill-current"
            fill="none"
            height="24"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M4.43057 8.51192C4.70014 8.19743 5.17361 8.161 5.48811 8.43057L12 14.0122L18.5119 8.43057C18.8264 8.16101 19.2999 8.19743 19.5695 8.51192C19.839 8.82642 19.8026 9.29989 19.4881 9.56946L12.4881 15.5695C12.2072 15.8102 11.7928 15.8102 11.5119 15.5695L4.51192 9.56946C4.19743 9.29989 4.161 8.82641 4.43057 8.51192Z"
              fill=""
              fillRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div
        className={`flex-wrap gap-2.5 p-6 ${
          toggleDropdown ? "flex" : "hidden"
        }`}
      >
        {sizes.map((size) => {
          const selected = selectedSizes.includes(size);
          return (
            <button
              className={`flex cursor-pointer select-none items-center rounded-control hover:bg-action-primary-background hover:text-white ${
                selected ? "bg-action-primary-background text-white" : ""
              }`}
              key={size}
              onClick={() => toggleSize(size)}
              type="button"
            >
              <span className="rounded-control px-3.5 py-[5px] text-custom-sm">
                {size}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SizeDropdown;
