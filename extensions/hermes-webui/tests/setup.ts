import { act } from "react";
import { afterEach } from "vitest";
import { cleanupRendererForTests } from "../src/message-renderer-island";

// Suppress TS7017 — vitest/jsdom exposes this global at runtime
declare const IS_REACT_ACT_ENVIRONMENT: boolean;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stub ResizeObserver — not in jsdom
(globalThis as typeof globalThis & { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Stub Element.scrollTo — assistant-ui's viewport auto-scroll fires this in a RAF;
// jsdom doesn't implement scrollTo so we stub it to silence the unhandled error.
if (!HTMLElement.prototype.scrollTo) {
  (HTMLElement.prototype as any).scrollTo = () => {};
}

// Stub requestAnimationFrame with a deferred call — assistant-ui's smooth
// text streaming animates character-by-character via rAF and measures elapsed
// time with Date.now(); jsdom never fires rAF, so streamed text would appear
// stuck at the previous prefix. setTimeout(0) lets the animator's clock math
// work while keeping the test deterministic enough.
const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
let rafId = 0;
(globalThis as typeof globalThis & { requestAnimationFrame: unknown }).requestAnimationFrame = (
  cb: FrameRequestCallback,
) => {
  const id = ++rafId;
  const timer = setTimeout(() => {
    rafTimers.delete(id);
    cb(Date.now());
  }, 0);
  rafTimers.set(id, timer);
  return id;
};
(globalThis as typeof globalThis & { cancelAnimationFrame: unknown }).cancelAnimationFrame = (
  id: number,
) => {
  const timer = rafTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    rafTimers.delete(id);
  }
};

afterEach(async () => {
  await act(async () => {
    cleanupRendererForTests();
  });
  document.body.innerHTML = "";
});
