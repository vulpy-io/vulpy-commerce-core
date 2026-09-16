"use client";

import { useEffect, useRef, useState } from "react";
import RangeSlider from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";
import { useStoreCurrency } from "@/context/StoreRegionContext";
import { getCurrencySymbol } from "@/lib/medusa/money";

type PriceDropdownProps = {
  min: number;
  max: number;
  selectedMin: number;
  selectedMax: number;
  onChange: (range: { min: number; max: number }) => void;
};

const PriceDropdown = ({
  min,
  max,
  selectedMin,
  selectedMax,
  onChange,
}: PriceDropdownProps) => {
  const currencyCode = useStoreCurrency();
  const currencySymbol = getCurrencySymbol(currencyCode);
  const [toggleDropdown, setToggleDropdown] = useState(true);
  const sliderMax = Math.max(max, min + 1);
  const rangeRef = useRef<[number, number]>([selectedMin, selectedMax]);
  const [range, setRange] = useState<[number, number]>([selectedMin, selectedMax]);

  useEffect(() => {
    const next: [number, number] = [selectedMin, selectedMax];
    rangeRef.current = next;
    setRange(next);
  }, [selectedMin, selectedMax]);

  const handleRangeInput = (values: number[]) => {
    const next: [number, number] = [
      Math.floor(values[0]),
      Math.ceil(values[1]),
    ];
    rangeRef.current = next;
    setRange(next);
  };

  const commitRange = () => {
    const [nextMin, nextMax] = rangeRef.current;
    if (nextMin !== selectedMin || nextMax !== selectedMax) {
      onChange({ min: nextMin, max: nextMax });
    }
  };

  return (
    <div className="rounded-lg bg-white shadow-1">
      <div
        className="flex cursor-pointer items-center justify-between py-3 pr-5.5 pl-6"
        onClick={() => setToggleDropdown(!toggleDropdown)}
      >
        <p className="font-bold text-[11px] text-content-primary uppercase tracking-[0.14em]">Price</p>
        <button
          aria-label="Expand price filter"
          className={`text-content-primary duration-200 ease-out ${
            toggleDropdown && "rotate-180"
          }`}
          id="price-dropdown-btn"
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

      <div className={`p-6 ${toggleDropdown ? "block" : "hidden"}`}>
        <div id="pricingOne">
          <div className="price-range">
            <RangeSlider
              className="margin-lg"
              id="range-slider-gradient"
              key={`${min}-${sliderMax}`}
              max={sliderMax}
              min={min}
              onInput={handleRangeInput}
              onRangeDragEnd={commitRange}
              onThumbDragEnd={commitRange}
              step={1}
              value={range}
            />

            <div className="price-amount flex items-center justify-between pt-4">
              <div className="flex rounded-control border border-border-subtle text-content-muted text-custom-xs">
                <span className="block border-border-subtle border-r px-2.5 py-1.5">
                  {currencySymbol}
                </span>
                <span className="block px-3 py-1.5" id="minAmount">
                  {range[0]}
                </span>
              </div>

              <div className="flex rounded-control border border-border-subtle text-content-muted text-custom-xs">
                <span className="block border-border-subtle border-r px-2.5 py-1.5">
                  {currencySymbol}
                </span>
                <span className="block px-3 py-1.5" id="maxAmount">
                  {range[1]}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceDropdown;
