"use client";

import FinishSwatch from "@/components/Product/FinishSwatch";
import { getAvailableOptionValues } from "@/lib/medusa/variant-options";
import type { ProductDetail } from "@/types/product-detail";

type VariantOptionsProps = {
  product: ProductDetail;
  selectedOptions: Record<string, string>;
  onChange: (optionTitle: string, value: string) => void;
};

export default function VariantOptions({
  product,
  selectedOptions,
  onChange,
}: VariantOptionsProps) {
  if (product.options.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-col gap-5">
      {product.options.map((option) => {
        const availableValues = getAvailableOptionValues(
          product.variants,
          selectedOptions,
          option.title
        );
        const isFinish = option.title.toLowerCase().includes("finish");
        const isColor = option.title.toLowerCase().includes("color");
        const isSwatchOption = isFinish || isColor;
        const displayLabel = isSwatchOption ? "Color" : option.title;

        return (
          <div key={option.id}>
            <p className="mb-3 font-bold text-[11px] text-content-primary uppercase tracking-[0.06em]">
              {displayLabel}
            </p>

            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const selected = selectedOptions[option.title] === value;
                const available = availableValues.has(value);

                return (
                  <button
                    aria-disabled={!available}
                    aria-pressed={selected}
                    className={`inline-flex items-center gap-2 border bg-surface-raised px-4 py-1.5 font-normal text-sm duration-200 ease-out ${
                      selected
                        ? available
                          ? "border-action-primary-background text-content-primary"
                          : "border-action-primary-background text-content-primary line-through opacity-80"
                        : available
                          ? "border-border-strong text-content-secondary hover:border-content-primary hover:text-content-primary"
                          : "border-border-strong text-content-muted line-through opacity-40 hover:opacity-60"
                    }`}
                    key={value}
                    onClick={() => onChange(option.title, value)}
                    type="button"
                  >
                    {isSwatchOption ? (
                      <FinishSwatch name={value} size={14} withTooltip={false} />
                    ) : null}
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}