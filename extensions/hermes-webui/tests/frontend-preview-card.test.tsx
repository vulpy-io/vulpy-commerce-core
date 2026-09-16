import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import {
  buildPreviewMediaUrl,
  FrontendPreviewCard,
  FrontendToolErrorBoundary,
  frontendToolByName,
  parsePreviewArgs,
} from "../src/message-renderer-island";

describe("render_preview frontend tool", () => {
  it("is registered with the preview renderer", () => {
    expect(frontendToolByName.get("render_preview")?.renderer).toBe("preview");
  });

  it("accepts only a bounded absolute local-file request", () => {
    expect(parsePreviewArgs({ type: "html", path: "/tmp/mockup.html", title: "Mockup" })).toEqual({
      valid: true,
      type: "html",
      path: "/tmp/mockup.html",
      title: "Mockup",
    });
    for (const args of [
      {},
      { type: "pdf", path: "/tmp/file.pdf" },
      { type: "html", path: "relative.html" },
      { type: "html", path: "" },
      { type: "html", path: "/tmp/a", title: "x".repeat(121) },
      "not-json",
    ]) {
      expect(parsePreviewArgs(args).valid).toBe(false);
    }
  });

  it("builds a session-scoped encoded media URL without injecting content", () => {
    expect(buildPreviewMediaUrl("/tmp/my design.html?x=1", "session/one")).toBe(
      "api/media?path=%2Ftmp%2Fmy%20design.html%3Fx%3D1&session_id=session%2Fone&inline=1",
    );
  });

  it("renders HTML only in a sandboxed URL iframe and shows a recoverable load error", async () => {
    window.localStorage.setItem("hermes-webui-session", "s1");
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => { root.render(createElement(FrontendPreviewCard, { toolName: "render_preview", args: { type: "html", path: "/tmp/mockup.html" } })); });
    const frame = host.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("src")).toContain("session_id=s1");
    expect(frame.hasAttribute("srcdoc")).toBe(false);
    await act(async () => { root.unmount(); });
  });

  it("shows a recoverable media load error instead of throwing", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => { root.render(createElement(FrontendPreviewCard, { toolName: "render_preview", args: { type: "image", path: "/tmp/mockup.png" } })); });
    await act(async () => { host.querySelector("img")!.dispatchEvent(new Event("error", { bubbles: true })); });
    expect(host.textContent).toContain("Preview unavailable: the file could not be loaded");
    await act(async () => { root.unmount(); });
  });

  it("isolates renderer failures behind an inline error card", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const Broken = () => { throw new Error("bad preview"); };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => { root.render(createElement(FrontendToolErrorBoundary, null, createElement(Broken))); });
    expect(host.textContent).toContain("Preview unavailable: the preview renderer failed");
    consoleError.mockRestore();
    root.unmount();
  });
});
