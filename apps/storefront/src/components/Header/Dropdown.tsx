import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CmsNavItem } from "@/lib/cms/types";
import { NavActiveIndicator } from "./NavActiveIndicator";

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`shrink-0 fill-current transition-transform duration-300 ease-out ${
      open ? "rotate-180" : ""
    }`}
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      clipRule="evenodd"
      d="M2.95363 5.67461C3.13334 5.46495 3.44899 5.44067 3.65866 5.62038L7.99993 9.34147L12.3412 5.62038C12.5509 5.46495 12.8665 5.44067 13.0462 5.67461C13.2259 5.88428 13.2017 6.19993 12.992 6.37964L8.32532 10.3796C8.13808 10.5401 7.86178 10.5401 7.67453 10.3796L3.00787 6.37964C2.7982 6.19993 2.77392 5.88428 2.95363 5.67461Z"
      fill=""
      fillRule="evenodd"
    />
  </svg>
);

const RightChevronIcon = () => (
  <svg
    className="shrink-0 fill-current"
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      clipRule="evenodd"
      d="M5.67461 2.95363C5.88428 3.13334 5.90856 3.44899 5.72885 3.65866L9.34147 7.99993L5.72885 12.3412C5.90856 12.5509 5.88428 12.8665 5.67461 13.0462C5.46495 12.8665 5.44067 12.5509 5.62038 12.3412L9.37964 8.32532C9.54011 8.13808 9.54011 7.86178 9.37964 7.67453L5.62038 3.65866C5.44067 3.44899 5.46495 3.13334 5.67461 2.95363Z"
      fill=""
      fillRule="evenodd"
    />
  </svg>
);

/** Recursive descendant match — a trigger is active when ANY path in its tree matches. */
function isPathActive(item: CmsNavItem, pathUrl: string): boolean {
  if (item.path && pathUrl === item.path) {
    return true;
  }
  return (item.submenu ?? []).some((child) => isPathActive(child, pathUrl));
}

/**
 * One submenu item — either a leaf link, or a parent with nested children.
 * Desktop (xl+): renders the submenu parent with a right chevron and a
 * flyout panel revealed via group/sub hover. Mobile: renders an expandable
 * accordion row with its own toggle state.
 */
function SubmenuItem({
  item,
  pathUrl,
  isMobileNav,
  onClose,
}: {
  item: CmsNavItem;
  pathUrl: string;
  isMobileNav: boolean;
  onClose: () => void;
}) {
  const [nestedToggler, setNestedToggler] = useState(false);
  const isItemActive = isPathActive(item, pathUrl);
  const hasSubmenu = (item.submenu ?? []).length > 0;

  if (hasSubmenu && isMobileNav) {
    return (
      <div className="relative">
        <button
          aria-expanded={nestedToggler}
          className={`group/sub relative flex w-full items-center py-[7px] pr-8 pl-4 font-semibold text-caps text-content-primary text-custom-xs hover:bg-gray-1 ${
            isItemActive ? "bg-gray-1" : ""
          }`}
          onClick={() => setNestedToggler(!nestedToggler)}
          type="button"
        >
          {item.title}
          <ChevronIcon open={nestedToggler} />
        </button>
        <ul
          className={`static flex-col pl-4 ${nestedToggler ? "flex" : "hidden"}`}
        >
          {(item.submenu ?? []).map((grandchild, j) => {
            const isGrandchildActive = isPathActive(grandchild, pathUrl);
            return (
              <li key={j}>
                <Link
                  className={`group/sub relative flex items-center py-[7px] pr-8 pl-4 font-semibold text-caps text-content-primary text-custom-xs hover:bg-gray-1 ${
                    isGrandchildActive ? "bg-gray-1" : ""
                  }`}
                  href={grandchild.path}
                  onClick={() => {
                    onClose();
                  }}
                  {...(grandchild.newTab
                    ? { rel: "noopener noreferrer", target: "_blank" }
                    : {})}
                >
                  {grandchild.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (hasSubmenu && !isMobileNav) {
    return (
      <div className="group/sub relative">
        <Link
          className="relative flex items-center py-[7px] pr-8 pl-4 font-semibold text-caps text-content-primary text-custom-xs hover:bg-gray-1"
          href={item.path}
          onClick={onClose}
          {...(item.newTab ? { rel: "noopener noreferrer", target: "_blank" } : {})}
        >
          {item.title}
          <RightChevronIcon />
        </Link>
        <ul className="dropdown dropdown-nested">
          {(item.submenu ?? []).map((grandchild, j) => {
            const isGrandchildActive = isPathActive(grandchild, pathUrl);
            return (
              <li key={j}>
                <Link
                  className={`group/sub relative flex items-center py-[7px] pr-8 pl-4 font-semibold text-caps text-content-primary text-custom-xs hover:bg-gray-1 ${
                    isGrandchildActive ? "bg-gray-1" : ""
                  }`}
                  href={grandchild.path}
                  onClick={() => {
                    onClose();
                  }}
                  {...(grandchild.newTab
                    ? { rel: "noopener noreferrer", target: "_blank" }
                    : {})}
                >
                  {grandchild.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Leaf submenu item (no children)
  return (
    <Link
      className={`group/sub relative flex items-center py-[7px] pr-8 pl-4 font-semibold text-caps text-content-primary text-custom-xs hover:bg-gray-1 ${
        isItemActive ? "bg-gray-1" : ""
      }`}
      href={item.path}
      onClick={() => {
        onClose();
      }}
      {...(item.newTab ? { rel: "noopener noreferrer", target: "_blank" } : {})}
    >
      {item.title}
      <NavActiveIndicator
        hoverGroup="group/sub"
        position="right"
        variant="dot"
        visible={isItemActive}
      />
    </Link>
  );
}

/**
 * One nav item with a submenu. Desktop (xl+): nested submenus open as
 * right-side flyout panels revealed via group-hover/sub. Mobile: submenu
 * items with their own submenu become expandable accordion rows.
 */
const Dropdown = ({
  menuItem,
  stickyMenu,
  onNavigate,
}: {
  menuItem: CmsNavItem;
  stickyMenu: boolean;
  onNavigate?: () => void;
}) => {
  const [dropdownToggler, setDropdownToggler] = useState(false);
  const pathUrl = usePathname();
  const isMobileNav = Boolean(onNavigate);
  const isActive = isPathActive(menuItem, pathUrl);
  const titleClassName = `flex min-h-11 w-full items-center gap-1.5 font-semibold text-caps text-custom-xs ${
    isMobileNav
      ? "text-content-primary"
      : "text-content-primary xl:py-3"
  }`;

  const submenu = menuItem.submenu ?? [];

  return (
    <li className="group relative">
      <button
        aria-expanded={dropdownToggler}
        className={`${titleClassName} ${isMobileNav ? "w-fit" : "w-full xl:hidden"} text-left`}
        onClick={() => setDropdownToggler(!dropdownToggler)}
        type="button"
      >
        {menuItem.title}
        <ChevronIcon open={dropdownToggler} />
      </button>

      <Link
        className={`${titleClassName} ${isMobileNav ? "hidden" : "hidden xl:flex"}`}
        href={menuItem.path}
        onClick={onNavigate}
        {...(menuItem.newTab ? { rel: "noopener noreferrer", target: "_blank" } : {})}
      >
        <NavActiveIndicator position="left" visible={isActive} />
        {menuItem.title}
        <ChevronIcon open={false} />
      </Link>

      <ul
        className={`dropdown ${dropdownToggler && "flex"} ${
          isMobileNav
            ? "static mt-2 translate-y-0! border-0 bg-transparent shadow-none"
            : ""
        } xl:group-hover:translate-y-0`}
      >
        {submenu.map((item, i) => (
          <li className={item.mobileOnly ? "xl:hidden" : undefined} key={i}>
            <SubmenuItem
              isMobileNav={isMobileNav}
              item={item}
              onClose={() => {
                onNavigate?.();
                setDropdownToggler(false);
              }}
              pathUrl={pathUrl}
            />
          </li>
        ))}
      </ul>
    </li>
  );
};

export default Dropdown;