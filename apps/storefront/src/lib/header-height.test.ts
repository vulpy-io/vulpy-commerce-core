import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyHeaderHeight,
  HEADER_HEIGHT_CSS_VAR,
  observeHeaderHeight,
} from "./header-height";

// The storefront vitest suite runs in the node environment (no DOM), so these
// tests drive the adapter with minimal object stubs matching the subset of the
// HTMLElement/CSSStyleDeclaration API the module touches.
type StyleStub = {
  props: Record<string, string>;
  setProperty: (name: string, value: string) => void;
  getPropertyValue: (name: string) => string;
};

function makeStyle(): StyleStub {
  return {
    props: {},
    setProperty(name: string, value: string) {
      this.props[name] = value;
    },
    getPropertyValue(name: string) {
      return this.props[name] ?? "";
    },
  };
}

function makeEl(height = 64) {
  return { getBoundingClientRect: () => ({ height, width: 1280 }) };
}

function makeRoot() {
  return { style: makeStyle() };
}

/** Registry so the test can fire callback-style ResizeObserver notifications. */
let observerInstances: FakeResizeObserver[] = [];

class FakeResizeObserver {
  observed: unknown[] = [];
  cb: () => void;
  constructor(callback: () => void) {
    this.cb = callback;
    observerInstances.push(this);
  }
  observe(el: unknown) {
    this.observed.push(el);
  }
  disconnect() {
    this.observed = [];
  }
}

describe("applyHeaderHeight", () => {
  it("writes the measured height to --header-height on the root", () => {
    const root = makeRoot();
    applyHeaderHeight(makeEl(64) as unknown as HTMLElement, root as never);
    expect(root.style.getPropertyValue(HEADER_HEIGHT_CSS_VAR)).toBe("64px");
  });

  it("tracks the sticky shrink height (measured value)", () => {
    const root = makeRoot();
    applyHeaderHeight(makeEl(48) as unknown as HTMLElement, root as never);
    expect(root.style.getPropertyValue(HEADER_HEIGHT_CSS_VAR)).toBe("48px");
  });

  it("no-ops when header or root is missing", () => {
    expect(() => applyHeaderHeight(null, makeRoot() as never)).not.toThrow();
    expect(() =>
      applyHeaderHeight(makeEl() as unknown as HTMLElement, null),
    ).not.toThrow();
  });

  it("writes to a custom var name when provided", () => {
    const root = makeRoot();
    applyHeaderHeight(
      makeEl() as unknown as HTMLElement,
      root as never,
      "--my-header",
    );
    expect(root.style.getPropertyValue("--my-header")).toBe("64px");
    expect(root.style.getPropertyValue(HEADER_HEIGHT_CSS_VAR)).toBe("");
  });
});

describe("observeHeaderHeight", () => {
  const raf = vi.fn((cb: () => void) => {
    cb();
    return 1 as unknown as number;
  });
  const caf = vi.fn();

  afterEach(() => {
    observerInstances = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("applies the initial height on observe", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", caf);

    const root = makeRoot();
    const header = makeEl(64) as unknown as HTMLElement;
    const cleanup = observeHeaderHeight(header, root as never);

    expect(root.style.getPropertyValue(HEADER_HEIGHT_CSS_VAR)).toBe("64px");
    expect(cleanup).toBeTypeOf("function");
    expect(() => cleanup?.()).not.toThrow();
  });

  it("re-measures after the ResizeObserver fires (sticky shrink)", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", caf);

    const root = makeRoot();
    const header = makeEl(64) as unknown as HTMLElement;
    const cleanup = observeHeaderHeight(header, root as never);
    expect(root.style.getPropertyValue(HEADER_HEIGHT_CSS_VAR)).toBe("64px");

    // Simulate the header shrinking to 48px and the observer firing.
    const observer = observerInstances.at(-1);
    Object.defineProperty(header, "getBoundingClientRect", {
      value: () => ({ height: 48, width: 1280 }),
    });
    observer.cb();
    expect(root.style.getPropertyValue(HEADER_HEIGHT_CSS_VAR)).toBe("48px");

    cleanup?.();
    expect(caf).toHaveBeenCalledTimes(1); // cancels the frame scheduled after the callback
  });

  it("returns null when ResizeObserver is unavailable (SSR guard)", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    expect(
      observeHeaderHeight(makeEl() as unknown as HTMLElement, makeRoot() as never),
    ).toBeNull();
  });
});