/* Vulpy Commerce profile visibility overlay.
 *
 * Native profile controls remain the source of truth and own switching. This
 * only annotates the authenticated DOM; it never calls an unauthenticated
 * profile endpoint or changes new-session safety semantics.
 */
(() => {
  const PROFILE_SELECTORS = [
    "#titlebarProfileLabel",
    "#profileChipLabel",
  ];

  function activeProfile() {
    for (const selector of PROFILE_SELECTORS) {
      const node = document.querySelector(selector);
      const value = node?.getAttribute("data-profile") || node?.textContent?.trim();
      if (value) { return value; }
    }
    return null;
  }

  function annotate() {
    const profile = activeProfile();
    if (!profile) { return; }
    const chip = document.querySelector("#titlebarProfileBtn");
    if (chip) {
      if (chip.getAttribute("data-vc-active-profile") !== profile) {
        chip.setAttribute("data-vc-active-profile", profile);
      }
      const label = `Active profile: ${profile}`;
      if (chip.getAttribute("aria-label") !== label) { chip.setAttribute("aria-label", label); }
      if (chip.title !== label) { chip.title = label; }
    }
    if (document.documentElement.getAttribute("data-vc-active-profile") !== profile) {
      document.documentElement.setAttribute("data-vc-active-profile", profile);
    }
  }

  const observer = new MutationObserver(annotate);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  document.addEventListener("DOMContentLoaded", annotate);
  annotate();
})();