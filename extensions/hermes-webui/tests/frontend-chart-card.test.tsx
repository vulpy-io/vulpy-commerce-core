/**
 * Frontend-tools chart card tests (issue #144).
 *
 * Registered frontend tools (create_chart) render a client-side chart card
 * from the tool-call args in BOTH the settled (session-store) and live
 * (webui-stream) paths; unregistered tools keep the generic tool card.
 * Frontend cards are chrome-free: the chart IS the output (no tool
 * name/badge/status, never a collapsed <details> card).
 *
 * jsdom has no layout, so recharts 3's ResponsiveContainer measures 0×0 via
 * post-commit effects and renders nothing. Proven fix (round-2 probe,
 * 2026-08-15): do NOT mock the module — recharts 3 charts read their size
 * through `useResponsiveContainerContext` imported from an internal relative
 * path that vi.mock cannot intercept, and passing width/height props is
 * ignored. Instead stub the MEASURING PRIMITIVES (ResizeObserver +
 * getBoundingClientRect) so the real ResponsiveContainer measures 600×220,
 * publishes through the REAL context, and renders its actual SVG — the
 * assertions below check real rendered DOM (paths, ticks), not mocks.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureHermesBus,
  frontendToolByName,
  mountAssistantUiRenderer,
  parseChartArgs,
  unmountAssistantUiRenderer,
} from "../src/message-renderer-island";

/** Minimal EventSource fake: captures listeners, lets tests emit events. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const cb of this.listeners.get(type) ?? []) {
      cb({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

function resetFakeEventSource() {
  FakeEventSource.instances = [];
  (globalThis as Record<string, unknown>).EventSource = FakeEventSource;
}

function setHostStreamId(id: string | null) {
  (window as unknown as { S?: { session?: { active_stream_id?: string | null } } }).S = {
    session: { active_stream_id: id },
  };
}

/**
 * Stub the measuring primitives so recharts 3's REAL ResponsiveContainer
 * measures 600×220 and publishes through the REAL context (see header
 * comment — module mocking cannot intercept recharts 3's internal imports).
 */
function stubResponsiveLayout() {
  class FakeResizeObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {
      queueMicrotask(() => {
        this.callback(
          [{ contentRect: { width: 600, height: 220 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      });
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 600,
    height: 220,
    top: 0,
    left: 0,
    right: 600,
    bottom: 220,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

const VALID_CHART_ARGS = {
  chart_type: "line",
  title: "Monthly Revenue",
  data: [
    { label: "Jan", value: 10 },
    { label: "Feb", value: 20 },
    { label: "Mar", value: 15 },
  ],
  options: { x_label: "Month", y_label: "USD" },
};

function fakeChartMessages(args: unknown): Record<string, unknown>[] {
  return [
    { id: 1, role: "user", content: "make me a chart" },
    {
      id: 2,
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call_chart", function: { name: "create_chart", arguments: JSON.stringify(args) } },
      ],
      finish_reason: "tool_calls",
    },
    { id: 3, role: "tool", tool_call_id: "call_chart", content: '{"status":"rendered","tool":"create_chart"}' },
    { id: 4, role: "assistant", content: "", finish_reason: "stop" },
  ];
}

function fakeGenericToolMessages(): Record<string, unknown>[] {
  return [
    { id: 1, role: "user", content: "read a file" },
    {
      id: 2,
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call_a", function: { name: "read_file", arguments: '{"path":"/tmp/a"}' } },
      ],
      finish_reason: "tool_calls",
    },
    { id: 3, role: "tool", tool_call_id: "call_a", content: '{"ok":true}' },
    { id: 4, role: "assistant", content: "Done.", finish_reason: "stop" },
  ];
}

function installFetchMock(messages: () => Record<string, unknown>[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/api/sessions/")) {
      const u = String(url);
      const limitMatch = u.match(/[?&]limit=(\d+)/);
      const limit = limitMatch ? Number.parseInt(limitMatch[1], 10) : undefined;
      const allMsgs = messages();
      const sliced = limit === undefined ? allMsgs : allMsgs.slice(-limit);
      return {
        ok: true,
        json: async () => ({ object: "list", session_id: "s1", total: allMsgs.length, data: sliced }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function mountAndPoll() {
  mountAssistantUiRenderer();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  const pane = document.querySelector("[data-hermes-assistant-ui-pane]");
  if (!pane) { throw new Error("assistant-ui pane did not mount"); }
  return pane;
}

/** Frontend tools render as a bare inline card — no tool chrome. */
function frontendCard(pane: Element | null) {
  return pane?.querySelector(".hermes-frontend-tool-card");
}

describe("frontend-tools chart card", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="messages"></div>';
    window.localStorage.clear();
    window.localStorage.setItem("hermes-webui-session", "s1");
    (window as unknown as { __HERMES_AUI_POLL_MS?: number }).__HERMES_AUI_POLL_MS = 25;
    (window as unknown as { __HERMES_AUI_SMOOTH__?: string }).__HERMES_AUI_SMOOTH__ = "0";
    resetFakeEventSource();
    setHostStreamId(null);
    stubResponsiveLayout();
  });

  afterEach(() => {
    unmountAssistantUiRenderer();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    (window as unknown as { __HERMES_AUI_POLL_MS?: number }).__HERMES_AUI_POLL_MS = undefined;
    (window as unknown as { __HERMES_AUI_SMOOTH__?: string }).__HERMES_AUI_SMOOTH__ = undefined;
    (window as unknown as { S?: unknown }).S = undefined;
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("registry lookup exposes create_chart with a chart renderer", () => {
    expect(frontendToolByName.has("create_chart")).toBe(true);
    expect(frontendToolByName.has("read_file")).toBe(false);
    const def = frontendToolByName.get("create_chart");
    expect(def?.name).toBe("create_chart");
    expect(def?.renderer).toBe("chart");
    expect(def?.description.length).toBeGreaterThan(0);
  });

  it("parseChartArgs rejects broken shapes (mutation self-check)", () => {
    expect(parseChartArgs({}).valid).toBe(false);
    expect(parseChartArgs({ chart_type: "line", title: "T" }).valid).toBe(false);
    expect(parseChartArgs({ chart_type: "line", title: "T", data: [] }).valid).toBe(false);
    expect(parseChartArgs({ chart_type: "pie", title: "T", data: [{ label: "a", value: 1 }] }).valid).toBe(true);
    expect(parseChartArgs({ chart_type: "line", title: "T", data: [{ label: "a", value: "NaN" }] }).valid).toBe(false);
    expect(parseChartArgs({ chart_type: "line", title: "T", data: [{ label: "a", value: 5 }] }).valid).toBe(true);
    expect(parseChartArgs(VALID_CHART_ARGS).xLabel).toBe("Month");
    expect(parseChartArgs(VALID_CHART_ARGS).yLabel).toBe("USD");
    // Streaming args arrive as a JSON string on some paths — must parse too.
    expect(parseChartArgs(JSON.stringify(VALID_CHART_ARGS)).valid).toBe(true);
    expect(parseChartArgs(JSON.stringify(VALID_CHART_ARGS)).chartType).toBe("line");
    expect(parseChartArgs("not json").valid).toBe(false);
    expect(parseChartArgs(null).valid).toBe(false);
    // Nested values can arrive Python-repr'd (single quotes, str()'d lists):
    // "data" as a stringified list and "options" as a stringified dict.
    const pyArgs = {
      chart_type: "line",
      title: "Py",
      data: "[{'label': 'Jan', 'value': 12400}, {'label': 'Feb', 'value': 13850}]",
      options: "{'x_label': 'Month', 'y_label': 'USD', 'color': '#c8743a'}",
    };
    const pyParsed = parseChartArgs(pyArgs);
    expect(pyParsed.valid).toBe(true);
    expect(pyParsed.data).toEqual([
      { label: "Jan", value: 12_400 },
      { label: "Feb", value: 13_850 },
    ]);
    expect(pyParsed.xLabel).toBe("Month");
    expect(pyParsed.yLabel).toBe("USD");
    expect(pyParsed.color).toBe("#c8743a");
    // JSON-stringified nested data works too.
    const jsonDataArgs = {
      chart_type: "bar",
      title: "J",
      data: JSON.stringify([{ label: "a", value: 1 }]),
    };
    expect(parseChartArgs(jsonDataArgs).valid).toBe(true);
    expect(parseChartArgs({ ...jsonDataArgs, data: "not a list" }).valid).toBe(false);
  });

  it("settled create_chart (line) renders inline as output — chart only, no tool chrome", async () => {
    installFetchMock(() => fakeChartMessages(VALID_CHART_ARGS));
    const pane = await mountAndPoll();

    const card = frontendCard(pane);
    expect(card).not.toBeNull();
    // The chart IS the output: no generic tool card, no group, no chrome.
    expect(pane.querySelector("details.hermes-tool-card")).toBeNull();
    expect(pane.querySelector(".hermes-tool-group")).toBeNull();
    expect(card?.hasAttribute("data-status")).toBe(false);
    const text = card?.textContent ?? "";
    expect(text).not.toContain("frontend");
    expect(text).not.toContain("create_chart");
    expect(card?.querySelector(".hermes-frontend-badge")).toBeNull();
    // Chart content: title + real SVG.
    expect(text).toContain("Monthly Revenue");
    // Raw args JSON is replaced by the chart — no <pre> in the card body.
    expect(card?.querySelector(".hermes-tool-card-body pre")).toBeNull();

    const svg = card?.querySelector("svg.recharts-surface");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector(".recharts-line-curve")).not.toBeNull();
    // Axis ticks render: recharts auto-skips overlapping category labels
    // (jsdom cannot measure text width, so only the preserveEnd tail may
    // render) — assert the last category label and a numeric value tick.
    const tickTexts = Array.from(card?.querySelectorAll("text.recharts-cartesian-axis-tick-value") ?? [])
      .map((el) => el.textContent);
    expect(tickTexts).toContain("Mar");
    expect(tickTexts.some((t) => t !== null && /^\d+(\.\d+)?$/.test(t))).toBe(true);
  });

  it.each([
    ["bar", ".recharts-bar-rectangle"],
    ["area", ".recharts-area-curve"],
    ["pie", ".recharts-pie-sector"],
  ] as const)("settled create_chart (%s) renders its chart shape", async (chartType, selector) => {
    const args = { ...VALID_CHART_ARGS, chart_type: chartType };
    installFetchMock(() => fakeChartMessages(args));
    const pane = await mountAndPoll();

    const card = frontendCard(pane);
    expect(card).not.toBeNull();
    const svg = card?.querySelector("svg.recharts-surface");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector(selector)).not.toBeNull();
  });

  it("renders Python-repr'd nested args (data/options stringified) with the unit chip", async () => {
    const msgs: Record<string, unknown>[] = [
      { id: 1, role: "user", content: "chart it" },
      {
        id: 2,
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_chart",
            function: {
              name: "create_chart",
              arguments: JSON.stringify({
                chart_type: "bar",
                title: "Py Sales",
                data: "[{'label': 'T-Shirts', 'value': 412}, {'label': 'Pants', 'value': 187}]",
                options: "{'x_label': 'Category', 'y_label': 'Orders', 'color': '#1a8245'}",
              }),
            },
          },
        ],
        finish_reason: "tool_calls",
      },
      { id: 3, role: "tool", tool_call_id: "call_chart", content: '{"ok":1}' },
      { id: 4, role: "assistant", content: "done", finish_reason: "stop" },
    ];
    installFetchMock(() => msgs);
    mountAssistantUiRenderer();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const pane = document.querySelector("[data-hermes-assistant-ui-pane]")!;
    const card = frontendCard(pane);
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Py Sales");
    // Unit chip replaces the in-axis y label.
    expect(card?.querySelector(".hermes-frontend-chart-unit")?.textContent).toBe("Orders");
    expect(card?.querySelector("svg.recharts-surface")).not.toBeNull();
    // Vulpy palette drives the series fill.
    const bar = card?.querySelector(".recharts-bar-rectangle path, .recharts-bar-rectangle rect");
    expect(bar?.getAttribute("fill")).toBe("#1a8245");
  });

  it("missing/invalid args render the empty state, not a crash", async () => {
    installFetchMock(() => fakeChartMessages({ chart_type: "line", title: "", data: [] }));
    const pane = await mountAndPoll();

    const card = frontendCard(pane);
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("No data provided");
    expect(card?.querySelector("svg.recharts-surface")).toBeNull();
    expect(pane.textContent).not.toContain("Error");
  });

  it("an unregistered tool keeps the generic tool card (no frontend treatment)", async () => {
    installFetchMock(() => fakeGenericToolMessages());
    const pane = await mountAndPoll();

    const card = pane.querySelector(".hermes-tool-card");
    expect(card).not.toBeNull();
    expect(card?.hasAttribute("data-badge")).toBe(false);
    expect(card?.querySelector(".hermes-frontend-badge")).toBeNull();
    // Raw args JSON still renders for generic tools.
    const pre = card?.querySelector(".hermes-tool-card-body pre");
    expect(pre?.textContent).toContain("/tmp/a");
    expect(pane.textContent).toContain("read_file");
  });

  it("live path: create_chart tool event shows the chart card running, then completes", async () => {
    installFetchMock(() => fakeChartMessages(VALID_CHART_ARGS));
    await mountAndPoll();

    act(() => {
      ensureHermesBus().emit("hermes:run-started", {
        sessionId: "s1",
        streamId: "aabbccdd11223344",
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    // 2026-08-17: pane opens no socket; host forwards via hermes:stream-event.
    expect(FakeEventSource.instances.length).toBe(0);

    const emitStreamEvent = (type: string, data: unknown) =>
      ensureHermesBus().emit("hermes:stream-event", {
        sessionId: "s1",
        streamId: "aabbccdd11223344",
        eventType: type,
        data: JSON.stringify(data),
      });

    act(() => {
      emitStreamEvent("tool", { name: "create_chart", args: JSON.stringify(VALID_CHART_ARGS) });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const pane = document.querySelector("[data-hermes-assistant-ui-pane]")!;
    const liveCard = frontendCard(pane);
    expect(liveCard).not.toBeNull();
    // No chrome even while running — the chart renders from args immediately.
    expect(liveCard?.hasAttribute("data-status")).toBe(false);
    expect(liveCard?.textContent).toContain("Monthly Revenue");
    expect(liveCard?.querySelector("svg.recharts-surface")).not.toBeNull();

    act(() => {
      emitStreamEvent("tool_complete", { name: "create_chart", args: JSON.stringify(VALID_CHART_ARGS), is_error: false });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const settled = frontendCard(pane);
    expect(settled).not.toBeNull();
    expect(settled?.textContent).toContain("Monthly Revenue");
  });
});
