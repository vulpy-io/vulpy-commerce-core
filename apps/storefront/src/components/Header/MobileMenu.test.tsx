/**
 * Render-contract tests for MobileMenu (two-bar header, full-screen overlay).
 * Runs in node environment; uses react-dom/server renderToStaticMarkup.
 * Contract under test:
 *   - Phone/call section is REMOVED (was in the old mobile menu).
 *   - Search form is REMOVED from the burger — search lives in the dedicated
 *     overlay, so no <form>, select, typeahead, or search markup renders.
 *   - Nav links use the underline active indicator instead of the dot.
 *   - Wishlist and account links are kept.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for testing
const noop = () => {};

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/redux/store", () => ({
  useAppSelector: () => 0,
}));

vi.mock("@/config", () => ({
  default: {
    customerAccountsEnabled: false,
  },
}));

// CustomSelect + ProductSearchTypeahead are no longer rendered by the burger;
// keep them mocked so any accidental import/usage is surfaced as a hard fail.
vi.mock("./CustomSelect", () => ({
  default: () => <div data-testid="select-stub" />,
}));

vi.mock("./ProductSearchTypeahead", () => ({
  default: () => <div data-testid="typeahead-stub" />,
}));

import { MobileMenu } from "./MobileMenu";

const MOBILE_MENU_PROPS = {
  navigation: [
    { id: 1, title: "Home", path: "/", newTab: false },
    { id: 2, title: "Shop", path: "/shop", newTab: false },
  ],
  navigationOpen: true,
  stickyMenu: false,
  closeNavigation: noop,
  customer: null,
};

describe("MobileMenu", () => {
  it("no longer renders the phone/call section", () => {
    const html = renderToStaticMarkup(<MobileMenu {...MOBILE_MENU_PROPS} />);
    expect(html).not.toContain("Call us");
    expect(html).not.toContain("+1 555 000 0000");
  });

  it("renders the nav links with the underline active indicator", () => {
    const html = renderToStaticMarkup(<MobileMenu {...MOBILE_MENU_PROPS} />);
    expect(html).toContain(">Home</a>");
    expect(html).toContain('href="/shop"');
    expect(html).toContain("bg-content-primary");
    expect(html).toContain("h-0.5");
  });

  it("renders NO search form, select, or typeahead in the burger", () => {
    const html = renderToStaticMarkup(<MobileMenu {...MOBILE_MENU_PROPS} />);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('data-testid="select-stub"');
    expect(html).not.toContain('data-testid="typeahead-stub"');
    expect(html).not.toContain("Search products");
    expect(html).not.toContain('type="search"');
    // Nav + wishlist/account links still render after the form removal
    expect(html).toContain("/wishlist");
  });

  it("keeps the wishlist link", () => {
    const html = renderToStaticMarkup(<MobileMenu {...MOBILE_MENU_PROPS} />);
    expect(html).toContain('href="/wishlist"');
  });

  it("renders nested accordion rows for 3-level submenus", () => {
    const html = renderToStaticMarkup(
      <MobileMenu
        {...MOBILE_MENU_PROPS}
        navigation={[
          {
            id: 10,
            title: "Levitating Objects",
            path: "/categories/levitating-objects",
            newTab: false,
            submenu: [
              {
                id: 11,
                title: "All Levitating Objects",
                path: "/categories/levitating-objects",
                newTab: false,
                mobileOnly: true,
              },
              {
                id: 12,
                title: "Paperweights",
                path: "/categories/paperweights",
                newTab: false,
                submenu: [
                  {
                    id: 13,
                    title: "Desk Paperweights",
                    path: "/categories/desk-paperweights",
                    newTab: false,
                  },
                  {
                    id: 14,
                    title: "Cabinet Paperweights",
                    path: "/categories/cabinet-paperweights",
                    newTab: false,
                  },
                ],
              },
            ],
          },
        ]}
      />
    );

    // Nested accordion: grandchildren render inline with indentation
    expect(html).toContain("Desk Paperweights");
    expect(html).toContain("Cabinet Paperweights");
    expect(html).toContain("pl-4");
    expect(html).toContain("aria-expanded=");
  });

  it("uses aligned first-level rows and shared typography for nested rows", () => {
    const html = renderToStaticMarkup(
      <MobileMenu
        {...MOBILE_MENU_PROPS}
        navigation={[
          {
            id: 10,
            title: "Levitating Objects",
            path: "/categories/levitating-objects",
            newTab: false,
            submenu: [{ id: 11, title: "Paperweights", path: "/categories/paperweights", newTab: false }],
          },
          { id: 12, title: "Contact", path: "/contact", newTab: false },
        ]}
      />
    );

    expect(html).toContain('class="relative flex min-h-11 w-fit items-center');
    expect(html).not.toContain("min-h-11 items-center font-semibold text-caps text-content-primary text-custom-xs relative pl-4.5");
    expect(html).toContain("font-semibold text-caps text-custom-xs");
    expect(html).toContain("pl-4 font-semibold text-caps text-content-primary text-custom-xs");
    expect(html).not.toContain("hover:bg-gray-1 text-content-primary hover:bg-gray-1");
  });
});