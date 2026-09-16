import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import seamSource from "../host-transcript-store.js?raw";
import type { HostTranscriptStore } from "../src/types";

interface HostState {
  session: { session_id: string } | null;
  messages: unknown[];
  toolCalls: unknown[];
}

declare global {
  interface Window {
    HermesTranscriptStore?: HostTranscriptStore;
  }
}

function installSeam(state: HostState, inflight: Record<string, unknown>) {
  new Function("window", "S", "INFLIGHT", seamSource)(window, state, inflight);
  if (!window.HermesTranscriptStore) { throw new Error("projection seam did not install"); }
  return window.HermesTranscriptStore;
}

describe("host transcript projection seam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HermesTranscriptStore = undefined;
  });

  afterEach(() => {
    window.HermesTranscriptStore = undefined;
    vi.useRealTimers();
  });

  it("projects canonical settled and inflight state immutably and updates subscribers", () => {
    const state: HostState = {
      session: { session_id: "s1" },
      messages: [
        { id: "u1", role: "user", content: "Question" },
        {
          id: "a1",
          role: "assistant",
          reasoning: "Checking",
          tool_calls: [{ id: "tc1", function: { name: "lookup", arguments: "{\"q\":1}" } }],
          content: "Answer",
        },
        { role: "tool", tool_call_id: "tc1", content: { ok: true } },
      ],
      toolCalls: [],
    };
    const store = installSeam(state, {});
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const snapshot = store.getSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.messages)).toBe(true);
    expect(snapshot.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(snapshot.messages[1]?.parts.map((part) => part.type)).toEqual(["reasoning", "tool", "text"]);
    expect(snapshot.messages[1]?.parts[1]).toMatchObject({ id: "tc1", status: "complete", result: { ok: true } });

    state.messages[1] = { ...state.messages[1] as object, content: "Answer streamed" };
    vi.advanceTimersByTime(32);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().messages[1]?.parts.at(-1)).toMatchObject({ text: "Answer streamed" });

    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deduplicates canonical and live tools by stable call id and preserves lifecycle states", () => {
    const state: HostState = {
      session: { session_id: "s1" },
      messages: [{ id: "a1", role: "assistant", tool_calls: [{ id: "tc1", name: "shell", args: {} }], content: "" }],
      toolCalls: [],
    };
    const inflight = {
      s1: {
        messages: state.messages,
        toolCalls: [
          { id: "tc1", name: "shell", args: {}, done: true, result: "ok" },
          { id: "tc2", name: "approval", args: {}, requires_approval: true },
          { id: "tc3", name: "cancel", args: {}, cancelled: true },
          { id: "tc4", name: "bad", args: "{", malformed: true },
        ],
      },
    };
    const store = installSeam(state, inflight);
    const tools = store.getSnapshot().messages[0]?.parts.filter((part) => part.type === "tool") ?? [];

    expect(tools.map((part) => part.id)).toEqual(["tc1", "tc2", "tc3", "tc4"]);
    expect(tools.map((part) => "status" in part ? part.status : "")).toEqual(["complete", "approval", "cancelled", "malformed"]);
  });
});
