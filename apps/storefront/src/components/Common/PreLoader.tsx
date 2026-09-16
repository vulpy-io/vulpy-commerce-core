/**
 * Transient pre-load overlay.
 *
 * The overlay is a pure CSS veil: it fades out ~250ms after mount even if the
 * layout's JS effect never runs (hydration stall / HMR / websocket failure) —
 * the content underneath (always in the DOM) becomes clickable and visible.
 * `pointer-events: none` after the fade prevents a zombie overlay from
 * swallowing user input on a stalled page.
 */
const PreLoader = () => {
  return (
    <div
      aria-hidden="true"
      className="preloader-overlay fixed top-0 left-0 z-999999 flex h-dvh w-screen items-center justify-center bg-white"
    >
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-action-primary-background border-t-transparent border-solid" />
    </div>
  );
};

export default PreLoader;