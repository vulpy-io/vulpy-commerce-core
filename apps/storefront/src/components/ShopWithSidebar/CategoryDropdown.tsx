"use client";

import { useState } from "react";
import type { CategoryFilterOption } from "@/types/shop";

type CategoryItemProps = {
  category: CategoryFilterOption;
  selected: boolean;
  onToggle: (categoryId: string) => void;
};

const CategoryItem = ({ category, selected, onToggle }: CategoryItemProps) => {
  return (
    <button
      className={`${
        selected && "text-content-brand"
      } group flex items-center justify-between duration-200 ease-out hover:text-content-brand`}
      onClick={() => onToggle(category.id)}
      type="button"
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded border ${
            selected ? "border-action-primary-background bg-action-primary-background" : "border-border-subtle bg-surface-raised"
          }`}
        >
          <svg
            className={selected ? "block" : "hidden"}
            fill="none"
            height="10"
            viewBox="0 0 10 10"
            width="10"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.33317 2.5L3.74984 7.08333L1.6665 5"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.94437"
            />
          </svg>
        </div>

        <span className="text-left text-sm">{category.name}</span>
      </div>

      <span
        className={`${
          selected ? "bg-action-primary-background text-white" : "bg-surface-subtle text-content-muted"
        } inline-flex rounded-badge px-2 text-custom-xs duration-200 ease-out group-hover:bg-action-primary-background group-hover:text-white`}
      >
        {category.products}
      </span>
    </button>
  );
};

type CategoryDropdownProps = {
  categories: CategoryFilterOption[];
  selectedCategoryIds: string[];
  onChange: (categoryIds: string[]) => void;
};

const CategoryDropdown = ({
  categories,
  selectedCategoryIds,
  onChange,
}: CategoryDropdownProps) => {
  const [toggleDropdown, setToggleDropdown] = useState(true);

  const toggleCategory = (categoryId: string) => {
    if (selectedCategoryIds.includes(categoryId)) {
      onChange(selectedCategoryIds.filter((id) => id !== categoryId));
      return;
    }
    onChange([...selectedCategoryIds, categoryId]);
  };

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-white shadow-1">
      <div
        className={`flex cursor-pointer items-center justify-between py-3 pr-5.5 pl-6 ${
          toggleDropdown && "shadow-filter"
        }`}
        onClick={(e) => {
          e.preventDefault();
          setToggleDropdown(!toggleDropdown);
        }}
      >
        <p className="font-bold text-[11px] text-content-primary uppercase tracking-[0.14em]">Category</p>
        <button
          aria-label="Expand categories"
          className={`text-content-primary duration-200 ease-out ${
            toggleDropdown && "rotate-180"
          }`}
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
        className={`flex-col gap-3 py-6 pr-5.5 pl-6 ${
          toggleDropdown ? "flex" : "hidden"
        }`}
      >
        {categories.map((category) => (
          <CategoryItem
            category={category}
            key={category.id}
            onToggle={toggleCategory}
            selected={selectedCategoryIds.includes(category.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default CategoryDropdown;
