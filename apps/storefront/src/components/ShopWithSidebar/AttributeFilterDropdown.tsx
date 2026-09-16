"use client";

import { useState } from "react";
import FinishSwatch from "@/components/Product/FinishSwatch";

export default function AttributeFilterDropdown({
  label,
  values,
  selectedValues,
  onChange,
  showSwatches = false,
}: {
  label: string;
  values: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  /** Render color swatches next to each value (finish/color facets only). */
  showSwatches?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }

    onChange([...selectedValues, value]);
  };

  return (
    <div className="rounded-lg bg-white px-5 py-4 shadow-1">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className="font-bold text-[11px] text-content-primary uppercase tracking-[0.14em]">{label}</span>
        <span className="text-content-muted text-sm">{selectedValues.length || "All"}</span>
      </button>

      {isOpen ? (
        <div className="mt-4 flex flex-col gap-2">
          {values.map((value) => (
            <label className="flex cursor-pointer items-center gap-2" key={value}>
              <input
                checked={selectedValues.includes(value)}
                className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-border-strong bg-center bg-surface-raised bg-no-repeat transition-colors duration-150 checked:border-content-primary checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2010%2010%22%3E%3Cpath%20d%3D%22M8.33%202.5L3.75%207.08%201.67%205%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] checked:bg-content-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
                onChange={() => toggleValue(value)}
                type="checkbox"
              />
              {showSwatches ? (
                <FinishSwatch name={value} size={13} withTooltip={false} />
              ) : null}
              <span className="text-sm">{value}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
