"use client";

import { type ReactNode, useState } from "react";
import type { IconType } from "react-icons";
import {
  HiOutlineBeaker,
  HiOutlineDocumentText,
  HiOutlineListBullet,
  HiOutlineTruck,
} from "react-icons/hi2";
import { storefrontEn } from "@/i18n/en";

type TabItem = {
  id: string;
  label: string;
  icon: IconType;
  content: ReactNode;
  defaultOpen?: boolean;
};

export default function ProductDetailsTabs({
  description,
  features,
  contains,
  delivery,
}: {
  description: ReactNode;
  features?: ReactNode;
  contains?: ReactNode;
  delivery: ReactNode;
}) {
  const items: TabItem[] = [
    {
      id: "description",
      label: "Description",
      icon: HiOutlineDocumentText,
      content: description,
      defaultOpen: true,
    },
  ];

  if (features) {
    items.push({
      id: "features",
      label: "Specifications",
      icon: HiOutlineListBullet,
      content: features,
    });
  }

  if (contains) {
    items.push({
      id: "contains",
      label: storefrontEn.contains,
      icon: HiOutlineBeaker,
      content: contains,
    });
  }

  items.push({
    id: "delivery",
    label: "Delivery & returns",
    icon: HiOutlineTruck,
    content: delivery,
  });

  const defaultId = items.find((item) => item.defaultOpen)?.id ?? items[0]?.id;
  const [activeId, setActiveId] = useState<string | null>(defaultId ?? null);
  const active = items.find((item) => item.id === activeId) ?? items[0];

  return (
    <div>
      <div
        aria-label="Product details"
        className="flex flex-wrap items-center gap-1 rounded-lg bg-gray-2 p-1"
        role="tablist"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active?.id;
          return (
            <button
              aria-controls={`pdp-tab-panel-${item.id}`}
              aria-selected={isActive}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-bold text-[12px] uppercase tracking-[0.1em] transition-colors duration-200 ease-out ${
                isActive
                  ? "bg-white text-content-primary shadow-1"
                  : "text-content-muted hover:text-content-primary"
              }`}
              id={`pdp-tab-${item.id}`}
              key={item.id}
              onClick={() => setActiveId(item.id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden size={14} />
              {item.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <div
          aria-labelledby={`pdp-tab-${active.id}`}
          className="mt-4 rounded-panel border border-gray-3 bg-white p-5 text-content-secondary text-sm leading-relaxed sm:p-6"
          id={`pdp-tab-panel-${active.id}`}
          role="tabpanel"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
