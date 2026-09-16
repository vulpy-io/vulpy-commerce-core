"use client";
import type { HttpTypes } from "@medusajs/types";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import { cmsSectionProps } from "@/components/cms/cms-section";
import config from "@/config";
import { useCanSeePrices } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import type { CmsNavItem, CmsSiteSettings } from "@/lib/cms/types";
import {
  HEADER_LOGO_HEIGHT,
  HEADER_LOGO_WIDTH,
  headerLogoUrl,
  isSvgLogo,
} from "@/lib/site-logo";
import { useAppSelector } from "@/redux/store";
import Dropdown from "./Dropdown";
import { NavActiveIndicator } from "./NavActiveIndicator";

export interface NavBarProps {
  navigation: CmsNavItem[];
  stickyMenu: boolean;
  siteSettings: CmsSiteSettings;
  customer: HttpTypes.StoreCustomer | null;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
  onOpenSearch: () => void;
}

const SearchIcon = () => (
  <svg
    fill="none"
    height="22"
    stroke="currentColor"
    strokeWidth="1.6"
    viewBox="0 0 24 24"
    width="22"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

const AccountIcon = () => (
  <svg
    fill="none"
    height="22"
    stroke="currentColor"
    strokeWidth="1.6"
    viewBox="0 0 24 24"
    width="22"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </svg>
);

const FavouritesIcon = () => (
  <svg
    fill="none"
    height="22"
    stroke="currentColor"
    strokeWidth="1.6"
    viewBox="0 0 24 24"
    width="22"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

/** Shopping cart with wheels — NOT a bag. */
const CartIcon = () => (
  <svg
    fill="none"
    height="22"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.6"
    viewBox="0 0 24 24"
    width="22"
  >
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M3 3h2l.4 2M7 13h10l3-8H6.4" />
  </svg>
);

const HamburgerIcon = ({ navigationOpen }: { navigationOpen: boolean }) => (
  <span className="relative block h-5.5 w-5.5 cursor-pointer">
    <span className="du-block absolute right-0 h-full w-full">
      <span
        className={`relative top-0 left-0 my-1 block h-0.5 w-0 rounded-sm bg-surface-inverse delay-[0] duration-200 ease-in-out ${
          !navigationOpen && "w-full! delay-300"
        }`}
      />
      <span
        className={`relative top-0 left-0 my-1 block h-0.5 w-0 rounded-sm bg-surface-inverse delay-150 duration-200 ease-in-out ${
          !navigationOpen && "w-full! delay-400"
        }`}
      />
      <span
        className={`relative top-0 left-0 my-1 block h-0.5 w-0 rounded-sm bg-surface-inverse delay-200 duration-200 ease-in-out ${
          !navigationOpen && "w-full! delay-500"
        }`}
      />
    </span>
    <span className="absolute right-0 block h-full w-full rotate-45">
      <span
        className={`absolute top-0 left-2.5 block h-full w-0.5 rounded-sm bg-surface-inverse delay-300 duration-200 ease-in-out ${
          !navigationOpen && "h-0! delay-[0]"
        }`}
      />
      <span
        className={`absolute top-2.5 left-0 block h-0.5 w-full rounded-sm bg-surface-inverse delay-400 duration-200 ease-in-out ${
          !navigationOpen && "dealy-200 h-0!"
        }`}
      />
    </span>
  </span>
);

export const NavBar = ({
  navigation,
  stickyMenu,
  siteSettings,
  customer,
  navigationOpen,
  onToggleNavigation,
  onOpenSearch,
}: NavBarProps) => {
  const pathUrl = usePathname();
  const { openCartModal } = useCartModalContext();
  const { itemCount } = useCart();
  const canSeePrices = useCanSeePrices();
  const logoSrc = headerLogoUrl(siteSettings.logoUrl);
  const wishlistCount = useAppSelector((state) => state.wishlistReducer.items.length);

  return (
    <div className="border-gray-3 border-b bg-white">
      <div className="container">
        <div
          className={`flex items-center justify-between gap-4 py-3 ${
            stickyMenu ? "" : "lg:py-4"
          }`}
          {...cmsSectionProps({ type: "main-nav", global: "navigation" })}
        >
          {/* Left: Logo */}
          <Link className="shrink-0" href="/">
            <Image
              alt={siteSettings.siteName}
              className="h-auto w-[98px] lg:w-[135px]"
              height={HEADER_LOGO_HEIGHT}
              src={logoSrc}
              unoptimized={isSvgLogo(logoSrc)}
              width={HEADER_LOGO_WIDTH}
            />
          </Link>

          {/* Center: nav links — xl only */}
          <nav className="hidden xl:block">
            <ul className="flex flex-row items-center gap-6">
              {navigation.map((menuItem, i) =>
                menuItem.submenu?.length ? (
                  <Dropdown key={i} menuItem={menuItem} stickyMenu={stickyMenu} />
                ) : (
                  <li className="group relative" key={i}>
                    <Link
                      className="relative flex items-center py-3 font-semibold text-caps text-content-primary text-custom-xs"
                      href={menuItem.path}
                    >
                      <NavActiveIndicator
                        position="left"
                        visible={pathUrl === menuItem.path}
                      />
                      {menuItem.title}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>

          {/* Right: icon cluster */}
          <div className="flex shrink-0 items-center gap-1.5 lg:gap-2.5">
            {/* Search trigger — opens full-screen search overlay */}
            <button
              aria-label="Open search"
              className="flex h-10 w-10 items-center justify-center text-content-primary transition duration-200 ease-out hover:text-content-muted lg:h-9 lg:w-9"
              onClick={onOpenSearch}
              type="button"
            >
              <SearchIcon />
            </button>

            {/* Account — lg+ only */}
            {config.customerAccountsEnabled ? (
              <Link
                aria-label={customer ? "My account" : "Sign in"}
                className="hidden h-10 w-10 items-center justify-center text-content-primary transition duration-200 ease-out hover:text-content-muted lg:flex lg:h-9 lg:w-9"
                href={customer ? "/my-account" : "/signin"}
              >
                <AccountIcon />
              </Link>
            ) : null}

            {/* Favourites */}
            <Link
              aria-label="Wishlist"
              className="relative flex h-10 w-10 items-center justify-center text-content-primary transition duration-200 ease-out hover:text-content-muted lg:h-9 lg:w-9"
              href="/wishlist"
            >
              <FavouritesIcon />
              {wishlistCount > 0 ? (
                <span
                  aria-live="polite"
                  className="absolute top-0.5 right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-action-primary-background font-semibold text-2xs text-white"
                >
                  {wishlistCount}
                </span>
              ) : null}
            </Link>

            {/* Cart — hidden for guests when prices are gated */}
            {canSeePrices ? (
              <button
                aria-label="Open cart"
                className="relative flex h-10 w-10 items-center justify-center text-content-primary transition duration-200 ease-out hover:text-content-muted lg:h-9 lg:w-9"
                onClick={() => openCartModal()}
                type="button"
              >
                <CartIcon />
                <span
                  aria-live="polite"
                  className="absolute top-0.5 right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-action-primary-background font-semibold text-2xs text-white"
                >
                  {itemCount}
                </span>
              </button>
            ) : null}

            {/* Hamburger — hidden xl+ */}
            <button
              aria-expanded={navigationOpen}
              aria-label={navigationOpen ? "Close menu" : "Menu"}
              className="block xl:hidden"
              id="Toggle"
              onClick={onToggleNavigation}
              type="button"
            >
              <HamburgerIcon navigationOpen={navigationOpen} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
