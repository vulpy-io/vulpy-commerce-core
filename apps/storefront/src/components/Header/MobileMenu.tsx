"use client";
import type { HttpTypes } from "@medusajs/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cmsSectionProps } from "@/components/cms/cms-section";
import config from "@/config";
import { PSEUDO_CATEGORY_SALE } from "@/lib/cms/pseudo-categories";
import type { CmsNavItem } from "@/lib/cms/types";
import { useAppSelector } from "@/redux/store";
import Dropdown from "./Dropdown";
import { NavActiveIndicator, } from "./NavActiveIndicator";

export interface MobileMenuProps {
  navigation: CmsNavItem[];
  navigationOpen: boolean;
  stickyMenu: boolean;
  closeNavigation: () => void;
  customer: HttpTypes.StoreCustomer | null;
}

export const MobileMenu = ({
  navigation,
  navigationOpen,
  stickyMenu,
  closeNavigation,
  customer,
}: MobileMenuProps) => {
  const pathUrl = usePathname();
  const wishlistCount = useAppSelector((state) => state.wishlistReducer.items.length);
  const hasWishlistItems = wishlistCount > 0;
  const saleInNav =
    navigation.some((item) => item.path === PSEUDO_CATEGORY_SALE.route);

  return (
    <div
      className={`fixed inset-x-0 top-[var(--header-height)] bottom-0 z-9998 overflow-y-auto bg-white px-[15px] py-6 transition-opacity duration-200 xl:hidden ${
        navigationOpen
          ? "visible opacity-100"
          : "pointer-events-none invisible opacity-0"
      }`}
    >
      <nav {...cmsSectionProps({ type: "main-nav", global: "navigation" })}>
        <ul className="flex flex-col gap-4 border-gray-3 border-t pt-6">
          {navigation.map((menuItem, i) =>
            menuItem.submenu?.length ? (
              <Dropdown
                key={i}
                menuItem={menuItem}
                onNavigate={closeNavigation}
                stickyMenu={stickyMenu}
              />
            ) : (
              <li key={i}>
                <Link
                  className="relative flex min-h-11 w-fit items-center font-semibold text-caps text-content-primary text-custom-xs"
                  href={menuItem.path}
                  onClick={closeNavigation}
                >
                  <NavActiveIndicator
                    mobileFit
                    position="left"
                    visible={pathUrl === menuItem.path}
                  />
                  {menuItem.title}
                </Link>
              </li>
            )
          )}

          {saleInNav ? null : (
          <li>
            <Link
              className="relative flex min-h-11 w-fit items-center font-semibold text-caps text-content-primary text-custom-xs"
              href={PSEUDO_CATEGORY_SALE.route}
              onClick={closeNavigation}
            >
              <NavActiveIndicator
                mobileFit
                position="left"
                visible={pathUrl === PSEUDO_CATEGORY_SALE.route}
              />
              {PSEUDO_CATEGORY_SALE.title}
            </Link>
          </li>
          )}

          <li>
            <Link
              className="relative flex min-h-11 w-fit items-center gap-1.5 font-semibold text-caps text-content-primary text-custom-xs"
              href="/wishlist"
              onClick={closeNavigation}
            >
              <NavActiveIndicator mobileFit position="left" visible={pathUrl === "/wishlist"} />
              <svg
                className="fill-current"
                fill="none"
                height="16"
                viewBox="0 0 16 16"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                {hasWishlistItems ? (
                  <path
                    clipRule="evenodd"
                    d="M7.99992 2.97255C6.45855 1.5935 4.73256 1.40058 3.33376 2.03998C1.85639 2.71528 0.833252 4.28336 0.833252 6.0914C0.833252 7.86842 1.57358 9.22404 2.5444 10.3172C3.32183 11.1926 4.2734 11.9253 5.1138 12.5724C5.30431 12.7191 5.48911 12.8614 5.66486 12.9999C6.00636 13.2691 6.37295 13.5562 6.74447 13.7733C7.11582 13.9903 7.53965 14.1667 7.99992 14.1667C8.46018 14.1667 8.88401 13.9903 9.25537 13.7733C9.62689 13.5562 9.99348 13.2691 10.335 12.9999C10.5107 12.8614 10.6955 12.7191 10.886 12.5724C11.7264 11.9253 12.678 11.1926 13.4554 10.3172C14.4263 9.22404 15.1666 7.86842 15.1666 6.0914C15.1666 4.28336 14.1434 2.71528 12.6661 2.03998C11.2673 1.40058 9.54129 1.5935 7.99992 2.97255Z"
                    fill=""
                    fillRule="evenodd"
                  />
                ) : (
                  <path
                    clipRule="evenodd"
                    d="M5.97441 12.6073L6.43872 12.0183L5.97441 12.6073ZM7.99992 3.66709L7.45955 4.18719C7.60094 4.33408 7.79604 4.41709 7.99992 4.41709C8.2038 4.41709 8.3989 4.33408 8.54028 4.18719L7.99992 3.66709ZM10.0254 12.6073L10.4897 13.1962L10.0254 12.6073ZM6.43872 12.0183C5.41345 11.21 4.33627 10.4524 3.47904 9.48717C2.64752 8.55085 2.08325 7.47831 2.08325 6.0914H0.583252C0.583252 7.94644 1.3588 9.35867 2.35747 10.4832C3.33043 11.5788 4.57383 12.4582 5.51009 13.1962L6.43872 12.0183ZM2.08325 6.0914C2.08325 4.75102 2.84027 3.63995 3.85342 3.17683C4.81929 2.73533 6.15155 2.82823 7.45955 4.18719L8.54028 3.14699C6.84839 1.38917 4.84732 1.07324 3.22983 1.8126C1.65962 2.53035 0.583252 4.18982 0.583252 6.0914H2.08325ZM5.51009 13.1962C5.84928 13.4636 6.22932 13.7618 6.61834 13.9891C7.00711 14.2163 7.47619 14.4167 7.99992 14.4167V12.9167C7.85698 12.9167 7.65939 12.8601 7.37512 12.694C7.0911 12.5281 6.79171 12.2965 6.43872 12.0183L5.51009 13.1962ZM10.4897 13.1962C11.426 12.4582 12.6694 11.5788 13.6424 10.4832C14.641 9.35867 15.4166 7.94644 15.4166 6.0914H13.9166C13.9166 7.47831 13.3523 8.55085 12.5208 9.48717C11.6636 10.4524 10.5864 11.21 9.56112 12.0183L10.4897 13.1962ZM15.4166 6.0914C15.4166 4.18982 14.3402 2.53035 12.77 1.8126C11.1525 1.07324 9.15145 1.38917 7.45955 3.14699L8.54028 4.18719C9.84828 2.82823 11.1805 2.73533 12.1464 3.17683C13.1596 3.63995 13.9166 4.75102 13.9166 6.0914H15.4166ZM9.56112 12.0183C9.20813 12.2965 8.90874 12.5281 8.62471 12.694C8.34044 12.8601 8.14285 12.9167 7.99992 12.9167V14.4167C8.52365 14.4167 8.99273 14.2163 9.3815 13.9891C9.77052 13.7618 10.1506 13.4636 10.4897 13.1962L9.56112 12.0183Z"
                    fill=""
                    fillRule="evenodd"
                  />
                )}
              </svg>
              Wishlist
              {hasWishlistItems ? ` (${wishlistCount})` : ""}
            </Link>
          </li>

          {config.customerAccountsEnabled ? (
            <li>
              <Link
                className="relative flex min-h-11 w-fit items-center font-semibold text-caps text-content-primary text-custom-xs"
                href={customer ? "/my-account" : "/signin"}
                onClick={closeNavigation}
              >
                <NavActiveIndicator
                  position="left"
                  visible={pathUrl === "/my-account"}
                />
                {customer ? "My account" : "Sign in"}
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
};
