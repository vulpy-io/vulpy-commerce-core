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

type AccordionItem = {
  id: string;
  title: string;
  icon: IconType;
  content: ReactNode;
  defaultOpen?: boolean;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className={`shrink-0 fill-current duration-200 ease-out ${open ? "rotate-180" : ""}`}
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
  );
}

function AccordionPanel({
  item,
  open,
  onToggle,
}: {
  item: AccordionItem;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  const panelId = `product-accordion-${item.id}`;
  const buttonId = `${panelId}-button`;

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-1">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={`flex w-full items-center gap-4 px-4 py-4 text-left sm:px-6 sm:py-4.5 ${
          open ? "shadow-filter" : ""
        }`}
        id={buttonId}
        onClick={onToggle}
        type="button"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-1 text-body">
          <Icon aria-hidden size={20} />
        </span>
        <span className="flex-1 font-semibold text-content-primary lg:text-lg">{item.title}</span>
        <span className="text-content-primary">
          <ChevronIcon open={open} />
        </span>
      </button>

      <section
        aria-labelledby={buttonId}
        className={open ? "block" : "hidden"}
        id={panelId}
      >
        <div className="border-gray-3 border-t px-4 pt-4 pb-5 text-content-secondary sm:px-6 sm:pt-5 sm:pb-6 sm:pl-20">
          {item.content}
        </div>
      </section>
    </div>
  );
}

export default function ProductDetailsAccordion({
  description,
  features,
  contains,
  delivery,
  embedded = false,
}: {
  description: ReactNode;
  features?: ReactNode;
  contains?: ReactNode;
  delivery: ReactNode;
  embedded?: boolean;
}) {
  const items: AccordionItem[] = [
    {
      id: "description",
      title: "Description",
      icon: HiOutlineDocumentText,
      content: description,
      defaultOpen: true,
    },
  ];

  if (features) {
    items.push({
      id: "features",
      title: "Specifications",
      icon: HiOutlineListBullet,
      content: features,
    });
  }

  if (contains) {
    items.push({
      id: "contains",
      title: storefrontEn.contains,
      icon: HiOutlineBeaker,
      content: contains,
    });
  }

  items.push({
    id: "delivery",
    title: "Delivery & returns",
    icon: HiOutlineTruck,
    content: delivery,
  });

  const defaultOpenId = items.find((item) => item.defaultOpen)?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  const toggleItem = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
  };

  const panels = (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <AccordionPanel
          item={item}
          key={item.id}
          onToggle={() => toggleItem(item.id)}
          open={openId === item.id}
        />
      ))}
    </div>
  );

  if (embedded) {
    return panels;
  }

  return (
    <section className="overflow-hidden bg-gray-2 py-12 lg:py-17.5">
      <div className="container w-full">{panels}</div>
    </section>
  );
}
