"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { searchProductsAction } from "@/app/actions/search";
import ProductPrice from "@/components/Product/ProductPrice";
import { useStoreCurrency, useStoreRegion } from "@/context/StoreRegionContext";
import type { ProductSearchSuggestion } from "@/lib/medusa/search";

type ProductSearchTypeaheadProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  categoryId: string;
  onShowAll: () => void;
  onNavigate?: () => void;
  variant?: "header" | "mobile";
  inlineWithSelect?: boolean;
};

export default function ProductSearchTypeahead({
  value,
  onChange,
  placeholder,
  categoryId,
  onShowAll,
  onNavigate,
  variant = "header",
  inlineWithSelect = false,
}: ProductSearchTypeaheadProps) {
  const router = useRouter();
  const { regionId } = useStoreRegion();
  const currency = useStoreCurrency();
  const rootRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<ProductSearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPending, startTransition] = useTransition();

  const normalizedQuery = value.trim();
  const hasQuery = normalizedQuery.length >= 2;
  const hasSuggestions = suggestions.length > 0;
  const showDropdown = open && hasQuery;
  const isMobileVariant = variant === "mobile";
  const isInlineMobileSearch = isMobileVariant && inlineWithSelect;
  const listboxId = isMobileVariant
    ? "mobile-nav-search-suggestions"
    : "header-search-suggestions";

  useEffect(() => {
    if (!hasQuery) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const nextSuggestions = await searchProductsAction(
            normalizedQuery,
            categoryId === "0" ? undefined : categoryId,
            8,
            regionId
          );
          setSuggestions(nextSuggestions);
          setOpen(true);
          setActiveIndex(-1);
        } catch {
          setSuggestions([]);
          setOpen(false);
          setActiveIndex(-1);
        }
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [normalizedQuery, categoryId, regionId, hasQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeSuggestion = useMemo(
    () => (activeIndex >= 0 ? suggestions[activeIndex] : null),
    [activeIndex, suggestions]
  );

  useEffect(() => {
    if (!(showDropdown && activeIndex >= 0)) {
      return;
    }

    const element = document.getElementById(`header-search-option-${activeIndex}`);
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, showDropdown]);

  const navigateToSuggestion = (suggestion: ProductSearchSuggestion) => {
    setOpen(false);
    setActiveIndex(-1);
    onNavigate?.();
    router.push(`/products/${suggestion.handle}`);
  };

  return (
    <div
      className={`relative w-full ${
        isMobileVariant
          ? "min-w-0 flex-1 self-stretch"
          : "min-w-0 flex-1 self-stretch"
      }`}
      ref={rootRef}
    >
      {isMobileVariant ? null : (
        <span className="absolute top-1/2 left-0 inline-block h-5.5 w-px -translate-y-1/2 bg-gray-3" />
      )}
      <input
        aria-activedescendant={
          showDropdown && activeIndex >= 0
            ? `header-search-option-${activeIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls={showDropdown ? listboxId : undefined}
        aria-expanded={showDropdown}
        aria-label="Search products"
        autoComplete="off"
        className={`custom-search w-full outline-none duration-200 ease-in ${
          isInlineMobileSearch
            ? "h-full rounded-none rounded-l-none border-0 border-gray-3 border-l bg-white px-4 py-[11px] pr-12 text-content-primary placeholder:text-content-muted"
            : isMobileVariant
            ? "rounded-control border border-gray-3 bg-white px-4 py-[11px] pr-12 text-content-primary placeholder:text-content-muted"
            : "h-full rounded-none border-0 border-l-0! bg-white py-[11px] pr-12 pl-4 text-content-primary placeholder:text-content-muted"
        }`}
        id="search"
        name="search"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (hasQuery) {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (!showDropdown) {
            if (event.key === "ArrowDown" && suggestions.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(0);
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => {
              const next = current + 1;
              return next >= suggestions.length ? 0 : next;
            });
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => {
              const next = current - 1;
              return next < 0 ? suggestions.length - 1 : next;
            });
            return;
          }

          if (event.key === "Enter" && activeSuggestion) {
            event.preventDefault();
            navigateToSuggestion(activeSuggestion);
            return;
          }

          if (event.key === "Enter" && !activeSuggestion) {
            setOpen(false);
            setActiveIndex(-1);
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
            return;
          }

          if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
            return;
          }

          if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(Math.max(0, suggestions.length - 1));
            return;
          }

          if (event.key === "Tab") {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        type="search"
        value={value}
      />
      <button
        aria-label="Search"
        className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded bg-action-primary-background text-white duration-200 ease-in hover:bg-action-primary-hover"
        id="search-btn"
        onClick={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        type="submit"
      >
        <svg
          className="fill-current"
          fill="none"
          height="18"
          viewBox="0 0 18 18"
          width="18"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M17.2687 15.6656L12.6281 11.8969C14.5406 9.28123 14.3437 5.5406 11.9531 3.1781C10.6875 1.91248 8.99995 1.20935 7.19995 1.20935C5.39995 1.20935 3.71245 1.91248 2.44683 3.1781C-0.168799 5.79373 -0.168799 10.0687 2.44683 12.6844C3.71245 13.95 5.39995 14.6531 7.19995 14.6531C8.91558 14.6531 10.5187 14.0062 11.7843 12.8531L16.4812 16.65C16.5937 16.7344 16.7343 16.7906 16.875 16.7906C17.0718 16.7906 17.2406 16.7062 17.3531 16.5656C17.5781 16.2844 17.55 15.8906 17.2687 15.6656ZM7.19995 13.3875C5.73745 13.3875 4.38745 12.825 3.34683 11.7844C1.20933 9.64685 1.20933 6.18748 3.34683 4.0781C4.38745 3.03748 5.73745 2.47498 7.19995 2.47498C8.66245 2.47498 10.0125 3.03748 11.0531 4.0781C13.1906 6.2156 13.1906 9.67498 11.0531 11.7844C10.0406 12.825 8.66245 13.3875 7.19995 13.3875Z"
            fill=""
          />
        </svg>
      </button>

      {showDropdown ? (
        <div
          className={`absolute top-full z-50 mt-2 overflow-hidden rounded-md bg-white shadow-1 ${
            isInlineMobileSearch
              ? "left-[calc(-1*var(--mobile-search-select-width,200px))] z-[10002] w-[calc(100%+var(--mobile-search-select-width,200px))]"
              : isMobileVariant
              ? "right-0 left-0 z-[10002] w-full"
              : "left-0 z-[10002] w-full"
          }`}
        >
          {isPending ? (
            <div className="px-4 py-3 text-content-muted text-custom-sm">Searching...</div>
          ) : hasSuggestions ? (
            <>
              <ul
                className="scrollbar-no-arrows scrollbar-thin scrollbar-track-gray-1 scrollbar-thumb-gray-4 hover:scrollbar-thumb-gray-5 max-h-96 overflow-y-auto py-2"
                id={listboxId}
              >
                {suggestions.map((suggestion, index) => (
                  <li key={suggestion.id}>
                    <button
                      aria-selected={index === activeIndex}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        index === activeIndex ? "bg-gray-2" : "hover:bg-gray-2"
                      }`}
                      id={`header-search-option-${index}`}
                      onClick={() => navigateToSuggestion(suggestion)}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                      type="button"
                    >
                      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-control bg-white">
                        <Image
                          alt={suggestion.title}
                          className="h-full w-full object-contain"
                          height={56}
                          src={suggestion.thumbnail}
                          width={56}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-content-primary">
                          {suggestion.title}
                        </span>
                        {suggestion.model ? (
                          <span className="block truncate font-medium text-content-primary text-custom-xs">
                            {suggestion.model}
                          </span>
                        ) : null}
                        <ProductPrice
                          className="mt-0.5"
                          compareClassName="text-custom-xs text-content-muted line-through"
                          currency={currency}
                          currentClassName="text-custom-xs text-content-primary"
                          discountedPrice={suggestion.discountedPrice}
                          loginClassName="text-custom-xs"
                          maxPrice={suggestion.maxPrice}
                          minPrice={suggestion.minPrice}
                          price={suggestion.price}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <button
                className="w-full border-gray-3 border-t px-4 py-2 text-left font-bold text-content-primary text-custom-sm hover:bg-gray-2"
                onClick={() => {
                  setOpen(false);
                  setActiveIndex(-1);
                  onShowAll();
                }}
                type="button"
              >
                Show all results
              </button>
            </>
          ) : (
            <div className="px-4 py-3 text-content-muted text-custom-sm">
              No products found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
