import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  type ReasoningMessagePartProps,
  type ThreadMessageLike,
  ThreadPrimitive,
  type ToolCallMessagePartProps,
  useAuiState,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
// biome-ignore lint/performance/noNamespaceImport: single-file island bundle; named-import refactor is churn without benefit
import * as React from "react";
import { Children, Component, type ComponentType, createContext, isValidElement, memo, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import frontendToolsRegistry from "../frontend-tools/registry.json";

// The host WebUI declares `const S` at top level of a classic script (global
// lexical binding, NOT on window). We read its tail for optimistic attachment
// names; tests set window.S instead.
declare global {
  const S: {
    messages?: Record<string, unknown>[];
    busy?: boolean;
    activeStreamId?: string | null;
    session?: { session_id?: string; active_stream_id?: string | null };
  } | undefined;
}

// --------------------------------------------------------------------------
// Hermes design token bridge + full pane styling.
// The headless port has no library stylesheet — everything below IS the
// theme. Declared BEFORE the mount logic: _autoInit() runs at module load and
// the mount function references this constant — if it were declared later in
// the file, the IIFE would execute the mount call before the const is
// assigned (minified: var hoisting makes it undefined, producing "…undefined"
// in the style tag and dropping all overrides).
// --------------------------------------------------------------------------
const HERMES_CSS = `
[data-hermes-assistant-ui-pane] {
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  /* Match native .msg-body typography (graphite skin): 13px, 430, 1.6 — the
     previous 14px default made message text wider than the composer column. */
  font-size: var(--message-body-font-size, 13px);
  font-weight: 430;
  letter-spacing: 0;
  line-height: 1.6;
  background: var(--bg);
  color: var(--text);
}

/* ── Thread layout (headless primitives) ── */
[data-hermes-assistant-ui-pane] .hermes-thread-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}
[data-hermes-assistant-ui-pane] .hermes-thread-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0 24px;
  scroll-behavior: smooth;
}
/* Match the Fox native COMPOSER column width: --layout-max =
   min(64rem, 100% - 2.5rem) — the same constraint the input box uses, so the
   pane's message column aligns with the composer. */
[data-hermes-assistant-ui-pane] .hermes-message-row {
  max-width: var(--layout-max, 64rem);
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

/* ── Message rows ── */
/* Column layout so the role header / body / action footer stack vertically
   (native .msg-row structure). User rows right-align, assistant left. */
[data-hermes-assistant-ui-pane] .hermes-message-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 4px 16px;
}
[data-hermes-assistant-ui-pane] .hermes-message-assistant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 4px 16px;
}
[data-hermes-assistant-ui-pane] .hermes-bubble-user {
  max-width: 80%;
  border-radius: var(--radius-image, 16px);
  border: 1px solid color-mix(in srgb, var(--user-bubble-border, var(--border)) 32%, transparent);
  box-shadow: var(--shadow-default, 0 1px 2px rgba(0,0,0,.08));
  background: linear-gradient(180deg, rgb(255 255 255 / 28%), rgb(255 255 255 / 0%)),
    color-mix(in srgb, var(--user-bubble-bg, var(--accent)) 36%, transparent);
  color: var(--user-bubble-text, var(--text));
  padding: 8px 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
[data-hermes-assistant-ui-pane] .hermes-message-body {
  max-width: 100%;
  width: 100%;
  color: var(--text);
  line-height: 1.6;
}

/* ── Markdown (MarkdownTextPrimitive renders no aui-md-* classes in 0.14) ── */
[data-hermes-assistant-ui-pane] .hermes-md p {
  margin: 0.5em 0;
}
[data-hermes-assistant-ui-pane] .hermes-md p:first-child { margin-top: 0; }
[data-hermes-assistant-ui-pane] .hermes-md p:last-child { margin-bottom: 0; }
/* Fox heading scale (matches native .msg-body h1-h6 in fox-in-the-box.css). */
[data-hermes-assistant-ui-pane] .hermes-md h1 {
  font-family: var(--font-heading, var(--font-ui));
  font-size: calc(1.5rem * var(--fitb-app-scale, 1));
  line-height: 1.125;
  letter-spacing: -0.0146em;
  font-weight: 320;
  margin: 0.5em 0 0.3em;
}
[data-hermes-assistant-ui-pane] .hermes-md h2 {
  font-family: var(--font-heading, var(--font-ui));
  font-size: calc(1.25rem * var(--fitb-app-scale, 1));
  line-height: 1.25;
  letter-spacing: -0.0375em;
  font-weight: 400;
  margin: 0.5em 0 0.3em;
}
[data-hermes-assistant-ui-pane] .hermes-md h3 {
  font-family: var(--font-body, var(--font-ui));
  font-size: calc(1.125rem * var(--fitb-app-scale, 1));
  line-height: 1.357;
  letter-spacing: 0.0018em;
  font-weight: 500;
  margin: 0.5em 0 0.3em;
}
[data-hermes-assistant-ui-pane] .hermes-md h4 {
  font-family: var(--font-body, var(--font-ui));
  font-size: calc(1.05rem * var(--fitb-app-scale, 1));
  line-height: 1.333;
  letter-spacing: 0.0021em;
  font-weight: 600;
  margin: 0.5em 0 0.3em;
}
[data-hermes-assistant-ui-pane] .hermes-md h5,
[data-hermes-assistant-ui-pane] .hermes-md h6 {
  font-family: var(--font-body, var(--font-ui));
  font-size: calc(0.98rem * var(--fitb-app-scale, 1));
  line-height: 1.35;
  font-weight: 500;
  margin: 0.5em 0 0.3em;
}
[data-hermes-assistant-ui-pane] .hermes-md ul,
[data-hermes-assistant-ui-pane] .hermes-md ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
[data-hermes-assistant-ui-pane] .hermes-md ul { list-style: disc; }
[data-hermes-assistant-ui-pane] .hermes-md ol { list-style: decimal; }
[data-hermes-assistant-ui-pane] .hermes-md li { margin: 0.25em 0; }
[data-hermes-assistant-ui-pane] .hermes-md blockquote {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-md a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
[data-hermes-assistant-ui-pane] .hermes-md table {
  margin: 0.5em 0;
  border-collapse: collapse;
  width: 100%;
}
[data-hermes-assistant-ui-pane] .hermes-md th,
[data-hermes-assistant-ui-pane] .hermes-md td {
  border: 1px solid var(--border);
  padding: 4px 10px;
  text-align: left;
}
[data-hermes-assistant-ui-pane] .hermes-md th { background: var(--surface, rgba(0,0,0,.03)); font-weight: 600; }
[data-hermes-assistant-ui-pane] .hermes-md pre {
  background: var(--code-bg, var(--surface)) !important;
  color: var(--pre-text, var(--text)) !important;
  border: 1px solid var(--border-muted, rgba(0,0,0,.12));
  border-radius: var(--radius-md, 8px);
  padding: 10px 12px;
  overflow-x: auto;
  font-family: var(--font-mono, ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 1.5;
}
[data-hermes-assistant-ui-pane] .hermes-md code {
  font-family: var(--font-mono, ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace);
  background: var(--code-inline-bg, rgba(0,0,0,.06));
  color: var(--code-text, var(--text));
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.92em;
}
[data-hermes-assistant-ui-pane] .hermes-md pre code {
  background: none;
  padding: 0;
  color: inherit;
}

/* ── Tool card ── */
.hermes-tool-card {
  margin-top: 6px;
  /* Fox card styling (native .tool-card): radius-image + wash + shadow. */
  border-radius: var(--radius-image, var(--radius-md, 8px));
  background: var(--surface-subtle, rgba(0,0,0,.025));
  box-shadow: var(--shadow-default, none);
  font-size: 12px;
  overflow: hidden;
  font-family: var(--font-ui, -apple-system, sans-serif);
}
.hermes-tool-card summary {
  cursor: pointer;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  list-style: none;
  color: var(--text);
}
.hermes-tool-card summary::-webkit-details-marker { display: none; }
.hermes-tool-card-chevron {
  width: 12px;
  height: 12px;
  opacity: 0.5;
  flex-shrink: 0;
  transition: transform .15s;
}
.hermes-tool-card[open] .hermes-tool-card-chevron { transform: rotate(90deg); }
.hermes-tool-card-name { font-weight: 600; font-family: var(--font-mono, monospace); }
.hermes-tool-card-status { font-size: 11px; font-weight: 500; }
.hermes-tool-card-body {
  border-top: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hermes-tool-card pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
  font-family: var(--font-mono, monospace);
}
.hermes-tool-card pre.hermes-tool-result { color: var(--text); }

/* ── Frontend tool card (charts rendered client-side from call args) ── */
[data-hermes-assistant-ui-pane] .hermes-frontend-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--surface-subtle, rgba(0,0,0,.06));
  border: 1px solid var(--border-muted, var(--border));
  border-radius: 999px;
  padding: 2px 7px;
  margin-left: 2px;
  flex-shrink: 0;
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart {
  padding: 6px 2px 2px;
  min-width: 0;
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Unit chip next to the title — replaces the in-axis y label that overlapped
   the tick values on narrow screens. */
[data-hermes-assistant-ui-pane] .hermes-frontend-chart-unit {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface-subtle, rgba(0,0,0,.06));
  border: 1px solid var(--border-muted, var(--border));
  border-radius: 999px;
  padding: 1px 8px;
  flex-shrink: 0;
}
/* Compact Vulpy tooltip — small, restrained, no heavy shadow; replaces the
   default recharts box and cursor band. */
[data-hermes-assistant-ui-pane] .hermes-chart-tooltip {
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: var(--surface, #ffffff);
  border: 1px solid var(--border-muted, rgba(0,0,0,.14));
  border-radius: var(--radius-md, 8px);
  padding: 6px 10px;
  font-size: 11px;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
  pointer-events: none;
}
[data-hermes-assistant-ui-pane] .hermes-chart-tooltip-label {
  color: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-chart-tooltip-value {
  color: var(--text);
  font-weight: 600;
}
/* Axis ticks: 10px, muted — fits narrow screens without clipping. */
[data-hermes-assistant-ui-pane] .hermes-frontend-chart .recharts-cartesian-axis-tick-value {
  fill: var(--muted);
  font-size: 10px;
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart-empty {
  color: var(--muted);
  font-style: italic;
  padding: 14px 4px;
}
/* Frontend tools stream inline as part of the output — never collapsed and
   with no tool chrome (no name/badge/status). The rendered chart IS the
   output, like a markdown figure: bare card, just spacing. */
[data-hermes-assistant-ui-pane] .hermes-frontend-tool-card {
  margin-top: 6px;
}
/* recharts text/grid use inline SVG presentation attributes; CSS rules win
   the cascade, so theme the pane's variables here instead of var() in attrs. */
[data-hermes-assistant-ui-pane] .hermes-frontend-chart .recharts-text {
  fill: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart .recharts-cartesian-axis-tick-value {
  fill: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart .recharts-cartesian-axis-label {
  fill: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart .recharts-cartesian-grid line {
  stroke: var(--border-muted, var(--border));
}
/* recharts marks chart surfaces focusable — the svg via accessibilityLayer
   (default ON in v3, so every chart passes accessibilityLayer={false}) and
   the Pie root <g> via a hardcoded rootTabIndex=0 that ignores that flag
   (Pie gets rootTabIndex={-1} in code). Belt-and-braces: kill the browser's
   default thick dark focus ring on the svg AND any focusable descendant
   (tapped pie sectors etc.), plus the mobile tap-highlight flash. Charts are
   passive figures, not interactive controls — tooltip still works. */
[data-hermes-assistant-ui-pane] .hermes-frontend-chart {
  -webkit-tap-highlight-color: transparent;
}
[data-hermes-assistant-ui-pane] .hermes-frontend-chart svg:focus,
[data-hermes-assistant-ui-pane] .hermes-frontend-chart svg:focus-visible,
[data-hermes-assistant-ui-pane] .hermes-frontend-chart svg *:focus,
[data-hermes-assistant-ui-pane] .hermes-frontend-chart svg *:focus-visible {
  outline: none;
}

/* ── Tool group card (consecutive tool calls) ── */
.hermes-tool-group {
  margin-top: 6px;
  border-radius: var(--radius-md, 8px);
  background: var(--surface-subtle, rgba(0,0,0,.025));
  font-size: 12px;
  overflow: hidden;
  font-family: var(--font-ui, -apple-system, sans-serif);
}
.hermes-tool-group summary {
  cursor: pointer;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  list-style: none;
  color: var(--text);
}
.hermes-tool-group summary::-webkit-details-marker { display: none; }
.hermes-tool-group[open] .hermes-tool-card-chevron { transform: rotate(90deg); }
.hermes-tool-group-title { font-weight: 600; }
.hermes-tool-group-body {
  border-top: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
}
.hermes-tool-group-row {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hermes-tool-group-row + .hermes-tool-group-row {
  border-top: 1px dashed var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
}
.hermes-tool-group-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hermes-tool-group-row .hermes-tool-card-body {
  border-top: none;
  padding: 0 0 2px 20px;
}

/* ── Reasoning card ── */
.hermes-reasoning-card {
  margin-top: 6px;
  border-radius: var(--radius-image, var(--radius-md, 8px));
  background: var(--surface-subtle, rgba(0,0,0,.025));
  box-shadow: var(--shadow-default, none);
  font-size: 12px;
  overflow: hidden;
}
.hermes-reasoning-card summary {
  cursor: pointer;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  list-style: none;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--muted);
}
.hermes-reasoning-card summary::-webkit-details-marker { display: none; }
/* Concise collapsed summary: one-line snippet + word count between label and
 * the copy/chevron row. Clamped so long thinking never grows the summary. */
.hermes-reasoning-snippet {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  opacity: .75;
}
.hermes-reasoning-meta {
  flex: none;
  margin-left: auto;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  font-variant-numeric: tabular-nums;
  opacity: .55;
}
/* Native .thinking-card-btn-row parity: copy button + chevron on the right. */
.hermes-reasoning-btn-row {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.hermes-reasoning-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;
  opacity: .55;
}
.hermes-reasoning-copy-btn:hover { opacity: 1; background: var(--surface-subtle, rgba(0,0,0,.06)); }
.hermes-reasoning-toggle {
  transition: transform .15s;
  opacity: .7;
}
.hermes-reasoning-card[open] .hermes-reasoning-toggle { transform: rotate(90deg); }
.hermes-reasoning-body {
  border-top: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
  padding: 8px 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
.hermes-reasoning-body pre {
  margin: 0;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Live-turn Processing rail (one collapsible process lane per run) ── */
[data-hermes-assistant-ui-pane] details.hermes-processing-rail {
  margin: 2px 0 6px;
  border: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
  border-radius: var(--radius-image, var(--radius-md, 8px));
  background: var(--surface-subtle, rgba(0,0,0,.02));
  font-size: 12px;
  overflow: hidden;
}
[data-hermes-assistant-ui-pane] details.hermes-processing-rail > summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  list-style: none;
  user-select: none;
  font-weight: 500;
  font-size: 11px;
  color: var(--muted);
}
[data-hermes-assistant-ui-pane] details.hermes-processing-rail > summary::-webkit-details-marker { display: none; }
.hermes-processing-chevron { flex: none; width: 12px; height: 12px; transition: transform .15s; opacity: .7; }
details.hermes-processing-rail[open] > summary .hermes-processing-chevron { transform: rotate(90deg); }
.hermes-processing-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
}
.hermes-processing-meta {
  flex: none;
  margin-left: auto;
  font-weight: 400;
  opacity: .55;
  font-variant-numeric: tabular-nums;
}
[data-hermes-assistant-ui-pane] .hermes-processing-body {
  padding: 4px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── Live-turn worklog prose + elapsed timer (native parity) ── */
[data-hermes-assistant-ui-pane] .hermes-worklog-prose {
  margin: 2px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  opacity: .75;
  padding-left: 2px;
  border-left: 2px solid var(--border-muted, rgba(128,128,128,.3));
}
[data-hermes-assistant-ui-pane] .hermes-live-elapsed {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  opacity: .6;
}

/* ── Live thinking animation (only the in-progress card) ──
 * AI-style shimmer: a light sweep across the LABEL (gradient text) and a
 * soft glow pulse on the icon. Applied to the label span only, so the icon
 * (stroke=currentColor) never disappears into the transparent text clip. */
@media (prefers-reduced-motion: no-preference) {
  [data-hermes-assistant-ui-pane] .hermes-reasoning-card.live summary svg {
    animation: hermes-shimmer-glow 2.4s ease-in-out infinite;
  }
  [data-hermes-assistant-ui-pane] .hermes-reasoning-card.live summary .hermes-reasoning-label {
    background: linear-gradient(
      100deg,
      var(--muted) 40%,
      color-mix(in srgb, var(--muted) 30%, white) 50%,
      var(--muted) 60%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hermes-shimmer-sweep 2.8s ease-in-out infinite;
  }
  @keyframes hermes-shimmer-glow {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.5); }
  }
  @keyframes hermes-shimmer-sweep {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
}

/* ── Running tool status (in-progress card) ──
 * Soft breathing pulse on the status label + shimmer sweep on the tool
 * title and chevron so an in-flight tool reads as alive without a spinner. */
@media (prefers-reduced-motion: no-preference) {
  [data-hermes-assistant-ui-pane] .hermes-tool-card[data-status="running"] .hermes-tool-card-status,
  [data-hermes-assistant-ui-pane] .hermes-tool-group-row[data-status="running"] .hermes-tool-card-status {
    animation: hermes-tool-running-pulse 1.6s ease-in-out infinite;
  }
  [data-hermes-assistant-ui-pane] .hermes-tool-card[data-status="running"] summary .hermes-tool-card-name,
  [data-hermes-assistant-ui-pane] .hermes-tool-group-row[data-status="running"] .hermes-tool-card-name {
    background: linear-gradient(
      100deg,
      var(--muted) 40%,
      color-mix(in srgb, var(--muted) 30%, white) 50%,
      var(--muted) 60%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hermes-shimmer-sweep 2.8s ease-in-out infinite;
  }
  [data-hermes-assistant-ui-pane] .hermes-tool-card[data-status="running"] summary .hermes-tool-card-chevron,
  [data-hermes-assistant-ui-pane] .hermes-tool-group-row[data-status="running"] .hermes-tool-card-chevron {
    animation: hermes-shimmer-glow 2.4s ease-in-out infinite;
  }
  @keyframes hermes-tool-running-pulse {
    0%, 100% { opacity: .55; }
    50% { opacity: 1; }
  }
}

/* ── Load-earlier pagination ── */
.hermes-load-earlier {
  display: flex;
  justify-content: center;
  padding: 8px 16px 4px;
}
.hermes-load-earlier-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border);
  background: var(--surface-subtle, rgba(0,0,0,.025));
  color: var(--muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background .12s, color .12s;
  user-select: none;
}
.hermes-load-earlier-btn:hover:not(:disabled) {
  background: var(--surface, rgba(0,0,0,.06));
  color: var(--text);
}
.hermes-load-earlier-btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
.hermes-load-earlier-error {
  border-color: var(--color-error, #e53e3e);
  color: var(--color-error, #e53e3e);
}

/* ── Optimistic UI (issue #142): skeleton / typing / error / optimistic rows ── */
[data-hermes-assistant-ui-pane] .hermes-skeleton {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
/* Each skeleton block = one fake message bubble */
[data-hermes-assistant-ui-pane] .hermes-skeleton-msg {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
/* User bubbles align right */
[data-hermes-assistant-ui-pane] .hermes-skeleton-msg.hermes-skeleton-user {
  align-items: flex-end;
}
/* Rows: use currentColor-relative opacity so the shimmer is always visible
   regardless of theme (dark mode ≈ white currentColor → visible grey bands;
   light mode ≈ dark currentColor → visible grey bands). */
[data-hermes-assistant-ui-pane] .hermes-skeleton-row {
  height: 13px;
  border-radius: var(--radius-md, 6px);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, currentColor 14%, transparent) 25%,
    color-mix(in srgb, currentColor 26%, transparent) 50%,
    color-mix(in srgb, currentColor 14%, transparent) 75%
  );
  background-size: 200% 100%;
  animation: hermes-skeleton-shimmer 1.4s ease-in-out infinite;
}
[data-hermes-assistant-ui-pane] .hermes-skeleton-msg.hermes-skeleton-user .hermes-skeleton-row {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--primary, #6366f1) 30%, transparent) 25%,
    color-mix(in srgb, var(--primary, #6366f1) 50%, transparent) 50%,
    color-mix(in srgb, var(--primary, #6366f1) 30%, transparent) 75%
  );
  background-size: 200% 100%;
  animation: hermes-skeleton-shimmer 1.4s ease-in-out infinite;
  max-width: 60%;
}
@keyframes hermes-skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
[data-hermes-assistant-ui-pane] .hermes-typing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 12px;
}
[data-hermes-assistant-ui-pane] .hermes-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #888);
  opacity: .35;
  animation: hermes-typing-pulse 1.2s infinite ease-in-out;
}
[data-hermes-assistant-ui-pane] .hermes-typing-dot:nth-child(2) { animation-delay: .2s; }
[data-hermes-assistant-ui-pane] .hermes-typing-dot:nth-child(3) { animation-delay: .4s; }
@keyframes hermes-typing-pulse {
  0%, 70%, 100% { opacity: .35; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-2px); }
}
[data-hermes-assistant-ui-pane] .hermes-typing-label { margin-left: 2px; }
[data-hermes-assistant-ui-pane] .hermes-error-card {
  border: 1px solid var(--color-error, #e53e3e);
  border-radius: var(--radius-md, 8px);
  background: color-mix(in srgb, var(--color-error, #e53e3e) 8%, transparent);
  color: var(--text);
  font-size: 12px;
  padding: 10px 14px;
  max-width: var(--layout-max, 64rem);
}
[data-hermes-assistant-ui-pane] .hermes-error-card-title {
  font-weight: 700;
  color: var(--color-error, #e53e3e);
  margin-bottom: 4px;
}
[data-hermes-assistant-ui-pane] .hermes-error-card-body {
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-error-card-hint {
  color: var(--muted);
  font-style: italic;
}
[data-hermes-assistant-ui-pane] .hermes-optimistic-row .hermes-bubble-user {
  display: block;
  text-align: left;
}
[data-hermes-assistant-ui-pane] .hermes-optimistic-status {
  font-size: 11px;
  color: var(--muted);
  opacity: .8;
}
[data-hermes-assistant-ui-pane] .hermes-bubble-steer {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--warning, #d97706) 45%, transparent);
}
[data-hermes-assistant-ui-pane] .hermes-msg-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  /* Chips render ABOVE the message text — keep a gap below, not above. */
  margin-bottom: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-bubble-user .hermes-msg-files {
  justify-content: flex-end;
}
[data-hermes-assistant-ui-pane] .hermes-msg-file-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--accent-bg, var(--color-wash-subtle, rgba(0,0,0,.04)));
  border: 1px solid var(--accent-bg-strong, var(--color-wash-hover, rgba(0,0,0,.08)));
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 12px;
  color: var(--accent-text, var(--muted));
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-hermes-assistant-ui-pane] .hermes-msg-media-img {
  max-width: 180px;
  max-height: 120px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
}
/* ── MEDIA: inline images/links from agent output ── */
[data-hermes-assistant-ui-pane] .hermes-md .hermes-media-img {
  display: block;
  max-width: min(320px, 100%);
  max-height: 240px;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
  margin: 6px 0;
  cursor: zoom-in;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-media-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  word-break: break-all;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-media-audio,
[data-hermes-assistant-ui-pane] .hermes-md .hermes-media-video {
  display: block;
  max-width: 100%;
  border-radius: 8px;
  margin: 6px 0;
  background: var(--surface, transparent);
}
/* ── Code block header + copy button ── */
[data-hermes-assistant-ui-pane] .hermes-md .hermes-pre-wrap {
  position: relative;
  margin: 0.75em 0;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-pre-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--code-bg-header, color-mix(in srgb, var(--surface) 60%, transparent));
  border: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 25%, transparent));
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 4px 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
  user-select: none;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-pre-wrap pre {
  margin: 0;
  border-radius: 0 0 6px 6px;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-pre-wrap:not(:has(.hermes-pre-header)) pre {
  border-radius: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-code-copy-btn {
  background: none;
  border: 1px solid var(--border-muted, color-mix(in srgb, var(--border) 35%, transparent));
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  font-family: var(--font-ui, sans-serif);
  font-size: 10px;
  line-height: 1;
  padding: 2px 7px;
  transition: color .15s, border-color .15s, background .15s;
  white-space: nowrap;
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-code-copy-btn:hover {
  background: var(--accent-bg, rgba(0,0,0,.04));
  border-color: var(--accent-bg-strong, var(--border2, rgba(0,0,0,.12)));
  color: var(--text);
}
[data-hermes-assistant-ui-pane] .hermes-md .hermes-code-copy-btn.copied {
  color: var(--success, #16a34a);
  border-color: var(--success, #16a34a);
}
[data-hermes-assistant-ui-pane] .hermes-steer-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--warning, #d97706);
  margin-bottom: 2px;
}
[data-hermes-assistant-ui-pane] .hermes-steer-row { opacity: .92; }

/* ── Empty state (new session, no messages) ── */
[data-hermes-assistant-ui-pane] .hermes-empty-state {
  min-height: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--muted);
  text-align: center;
}
[data-hermes-assistant-ui-pane] .hermes-empty-logo {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}
[data-hermes-assistant-ui-pane] .hermes-empty-logo::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 170px;
  height: 170px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--logo-glow, color-mix(in srgb, var(--accent) 10%, transparent));
  z-index: 0;
  pointer-events: none;
}
[data-hermes-assistant-ui-pane] .hermes-empty-logo img {
  position: relative;
  z-index: 1;
  width: 80px;
  height: 80px;
  border-radius: 50%;
}
[data-hermes-assistant-ui-pane] .hermes-empty-title {
  font-family: var(--font-heading, var(--font-ui, sans-serif));
  font-size: calc(1.35rem * var(--fitb-app-scale, 1));
  font-weight: 380;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}
[data-hermes-assistant-ui-pane] .hermes-empty-subtitle {
  font-size: 13px;
  line-height: 1.6;
  max-width: 420px;
  margin: 0;
}
[data-hermes-assistant-ui-pane] .hermes-suggestion-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
  max-width: 380px;
}
[data-hermes-assistant-ui-pane] .hermes-empty-state.no-suggestions .hermes-suggestion-grid {
  display: none;
}
[data-hermes-assistant-ui-pane] .hermes-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--input-bg, var(--surface, rgba(0,0,0,.02)));
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  transition: all .15s;
  text-align: left;
  font-family: inherit;
}
[data-hermes-assistant-ui-pane] .hermes-suggestion:hover {
  background: var(--accent-bg, rgba(0,0,0,.03));
  border-color: var(--accent-bg-strong, var(--border2, rgba(0,0,0,.12)));
  color: var(--text);
}
[data-hermes-assistant-ui-pane] .hermes-suggestion-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--accent-text, var(--muted));
}
[data-hermes-assistant-ui-pane] .hermes-suggestion-icon svg { display: block; }

/* ── Message footer: timestamp + action buttons (native .msg-foot parity) ── */
[data-hermes-assistant-ui-pane] .hermes-msg-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  min-height: 16px;
}
[data-hermes-assistant-ui-pane] .hermes-message-user .hermes-msg-foot {
  justify-content: flex-end;
}
[data-hermes-assistant-ui-pane] .hermes-msg-time {
  opacity: .65;
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}
[data-hermes-assistant-ui-pane] .hermes-msg-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0; /* native .msg-actions: hidden at rest, revealed on row hover */
  transition: opacity .15s;
}
[data-hermes-assistant-ui-pane] .hermes-message-row:hover .hermes-msg-actions,
[data-hermes-assistant-ui-pane] .hermes-message-row:focus-within .hermes-msg-actions {
  opacity: 1;
}
[data-hermes-assistant-ui-pane] .hermes-msg-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--muted);
  cursor: pointer;
  transition: color .15s, background .15s;
}
[data-hermes-assistant-ui-pane] .hermes-msg-action-btn:hover {
  color: var(--text);
  background: var(--surface-subtle, rgba(0,0,0,.06));
}
[data-hermes-assistant-ui-pane] .hermes-msg-action-btn.copied {
  color: var(--success, #16a34a);
}

/* ── Assistant role header (native .msg-role parity) ── */
[data-hermes-assistant-ui-pane] .hermes-msg-role {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 6px;
  opacity: .8;
}
[data-hermes-assistant-ui-pane] .hermes-msg-role:hover { opacity: 1; }
[data-hermes-assistant-ui-pane] .hermes-msg-role-name { font-size: 12px; }
[data-hermes-assistant-ui-pane] .hermes-msg-role .role-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

/* ── Inline message edit (native .msg-edit-area / .msg-edit-bar parity) ── */
[data-hermes-assistant-ui-pane] .hermes-msg-edit-area {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: var(--input-bg, var(--surface, #ffffff));
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-family: var(--font-ui, -apple-system, sans-serif);
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  resize: none;
  overflow: auto;
  min-height: 60px;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar button {
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-subtle, rgba(0,0,0,.04));
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar button:hover {
  background: var(--surface, rgba(0,0,0,.08));
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar .hermes-msg-edit-send {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
  color: #fff;
  font-weight: 600;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar button:disabled {
  opacity: .5;
  cursor: not-allowed;
}
`;

/**
 * Minimal skeleton theme — the debug toggle flips between full Hermes styling
 * and this bare layout so the pane is usable (and obviously broken-looking)
 * when investigating whether a rendering issue is theme vs. data vs. library.
 */
const HERMES_CSS_MINIMAL = `
[data-hermes-assistant-ui-pane] {
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--message-body-font-size, 14px);
  background: var(--bg);
  color: var(--text);
}
[data-hermes-assistant-ui-pane] .hermes-thread-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
[data-hermes-assistant-ui-pane] .hermes-thread-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0 24px;
}
[data-hermes-assistant-ui-pane] .hermes-message-user,
[data-hermes-assistant-ui-pane] .hermes-message-assistant {
  padding: 4px 16px;
}
[data-hermes-assistant-ui-pane] .hermes-md pre {
  overflow-x: auto;
  font-family: var(--font-mono, monospace);
}
[data-hermes-assistant-ui-pane] summary { cursor: pointer; }
[data-hermes-assistant-ui-pane] .hermes-empty-state {
  min-height: calc(100% - 40px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  text-align: center;
  color: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-empty-logo img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
}
[data-hermes-assistant-ui-pane] .hermes-empty-title { color: var(--text); margin: 0; }
[data-hermes-assistant-ui-pane] .hermes-empty-subtitle { max-width: 420px; margin: 0; }
[data-hermes-assistant-ui-pane] .hermes-suggestion-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
  max-width: 380px;
}
[data-hermes-assistant-ui-pane] .hermes-empty-state.no-suggestions .hermes-suggestion-grid { display: none; }
[data-hermes-assistant-ui-pane] .hermes-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--input-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
[data-hermes-assistant-ui-pane] .hermes-msg-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 10px;
  color: var(--muted);
}
[data-hermes-assistant-ui-pane] .hermes-msg-actions { display: inline-flex; align-items: center; gap: 4px; }
[data-hermes-assistant-ui-pane] .hermes-msg-action-btn {
  background: none;
  border: none;
  padding: 2px;
  color: var(--muted);
  cursor: pointer;
}
[data-hermes-assistant-ui-pane] .hermes-msg-role {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-bottom: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-msg-role .role-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-area {
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  padding: 8px 10px;
  resize: none;
  min-height: 60px;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
[data-hermes-assistant-ui-pane] .hermes-msg-edit-bar button {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}
`;

// --------------------------------------------------------------------------
// API-server message mapping (OpenAI-native → assistant-ui parts).
// Source: GET /api/sessions/{session_id}/messages (Hermes API server, :8642,
// reached through the WebUI sidecar proxy). The session store is shared with
// the WebUI's legacy chat, so the thread mirrors whatever the host session
// has — no host-state seam involved.
// --------------------------------------------------------------------------

interface ApiToolCall {
  id?: string;
  call_id?: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
  name?: string;
  arguments?: string | Record<string, unknown>;
}

interface ApiMessage {
  id?: string | number;
  role?: string;
  content?: unknown;
  tool_calls?: ApiToolCall[] | null;
  tool_call_id?: string | null;
  tool_name?: string | null;
  finish_reason?: string | null;
  reasoning_content?: unknown;
  reasoning?: unknown;
  timestamp?: number;
  attachments?: unknown;
}

/** Normalize an attachment entry to a display label + file name. */
function attachmentNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) { return []; }
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (item.trim()) { names.push(item); }
    } else if (item && typeof item === "object") {
      const label = (item as { name?: unknown; filename?: unknown; path?: unknown }).name
        ?? (item as { name?: unknown; filename?: unknown; path?: unknown }).filename
        ?? (item as { name?: unknown; filename?: unknown; path?: unknown }).path;
      const s = String(label ?? "").trim();
      if (s) { names.push(s); }
    }
  }
  return names;
}

/** True when the file name looks like an image (native msg-media-img). */
function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i.test(String(name).split("?")[0] ?? "");
}

// ── MEDIA: token support ───────────────────────────────────────────────────

const _MEDIA_IMAGE_EXTS = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;
const _MEDIA_AUDIO_EXTS = /\.(mp3|ogg|wav|m4a|aac|flac|opus|webm|oga)$/i;
const _MEDIA_VIDEO_EXTS = /\.(mp4|webm|mkv|mov|avi|ogv|m4v)$/i;
const _MEDIA_HTML_EXTS = /\.(html?|htm)$/i;
const _MEDIA_MARKDOWN_EXTS = /\.(md|markdown|mdx)$/i;

/** Unique placeholder prefix so MEDIA: refs survive markdown processing.
 * HTML-safe: no angle brackets, no quotes, no null bytes — React won't strip it
 * during streaming diffing. Use a rare Unicode spacer that gets rendered as
 * normal text but is unique enough to split on. */
const MEDIA_PLACEHOLDER_PREFIX = "\u200BVULPY_MEDIA_";

interface MediaEntry { ref: string; }
let _mediaStash: MediaEntry[] = [];

/** Pre-process step: stash MEDIA:<ref> tokens so react-markdown doesn't
 *  mangle the path as a URL or paragraph text. Runs before markdown parsing. */
function preprocessMediaTokens(input: string): string {
  _mediaStash = [];
  const stash = (_match: string, lead: string, ref: string): string => {
    const idx = _mediaStash.length;
    _mediaStash.push({ ref });
    return `${lead}${MEDIA_PLACEHOLDER_PREFIX}${idx}\x00`;
  };
  // Formatting markers belong to the token boundary, not the file path. Drop
  // them with the token so ReactMarkdown cannot turn the placeholder into a
  // nested <strong>/<em> node that the paragraph splice cannot reach.
  let text = input.replace(/(^|[\s([{:,])\*\*MEDIA:(\/[^\s)\]]+|https?:\/\/[^\s)\]]+)\*\*/g, stash);
  text = text.replace(/(^|[\s([{:,])\*MEDIA:(\/[^\s)\]]+|https?:\/\/[^\s)\]]+)\*/g, stash);
  return text.replace(/(^|[\s([{:,])MEDIA:(\/[^\s)\]]+|https?:\/\/[^\s)\]]+)/g, stash);
}

function MarkdownMediaPreview({ ref, sessionId, fname, staticUrl }: { ref: string; sessionId: string; fname: string; staticUrl?: string }): React.ReactElement {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; text?: string }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    const apiMediaUrl = `api/media?path=${encodeURIComponent(ref)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
    // Same-origin static assets are fetched directly; filesystem paths ride
    // api/media (with the session id) exactly as before.
    const url = staticUrl ?? apiMediaUrl;
    fetch(url, { credentials: "include" })
      .then((response) => {
        if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
        return response.text();
      })
      .then((text) => {
        if (alive) { setState(text.length <= 256 * 1024 ? { status: "ready", text } : { status: "error" }); }
      })
      .catch(() => { if (alive) { setState({ status: "error" }); } });
    return () => { alive = false; };
  }, [ref, sessionId, staticUrl]);
  if (state.status === "loading") { return <div className="hermes-media-markdown hermes-media-markdown-loading">Loading {fname}…</div>; }
  if (state.status === "error") {
    const url = staticUrl ?? `api/media?path=${encodeURIComponent(ref)}&download=1`;
    return <a className="hermes-media-link" download={fname} href={url} rel="noopener noreferrer">📎 {fname}</a>;
  }
  return (
    <details className="hermes-media-markdown" open>
      <summary>{fname} · Markdown preview</summary>
      <div className="hermes-md"><ReactMarkdown rehypePlugins={[rehypeHighlight]} remarkPlugins={[remarkGfm]}>{state.text ?? ""}</ReactMarkdown></div>
    </details>
  );
}

/** Same-origin virtual static asset prefixes served directly by the WebUI
 *  (the extension overlay maps to /app/fox-overlay/webui_static at runtime).
 *  These are NOT filesystem paths — routing them through /api/media would
 *  404, so they must be used as the direct same-origin URL instead. */
function staticAssetUrl(ref: string): string | undefined {
  return /^\/(extensions|static)\//i.test(ref) ? ref : undefined;
}

/** Render a MEDIA: ref → React element. Mirrors native ui.js media restore. */
function MediaToken({ ref, sessionId }: { ref: string; sessionId: string }): React.ReactElement {
  const clean = ref.split("?")[0] ?? "";
  const fname = ref.split("/").pop() ?? ref;
  // Virtual static assets (/extensions/…, /static/…) are served same-origin
  // directly; real absolute filesystem paths and remote URLs keep their paths.
  const staticUrl = staticAssetUrl(clean);

  // HTTP(S) URL
  if (/^https?:\/\//i.test(ref)) {
    if (_MEDIA_AUDIO_EXTS.test(clean) || _MEDIA_VIDEO_EXTS.test(clean)) {
      const kind = _MEDIA_AUDIO_EXTS.test(clean) ? "audio" : "video";
      return React.createElement(kind as "audio" | "video", {
        className: `hermes-media-${kind}`,
        src: ref, controls: true,
      });
    }
    // All https:// → image (CDN extensionless paths)
    return <img alt={fname} className="hermes-media-img" height="auto" loading="lazy" src={ref} width="100%" />;
  }

  // Local file path → /api/media (unchanged for real filesystem paths)
  const apiUrl = `api/media?path=${encodeURIComponent(ref)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
  if (_MEDIA_IMAGE_EXTS.test(clean)) {
    const src = staticUrl ?? `${apiUrl}&inline=1`;
    return <img alt={fname} className="hermes-media-img" height="auto" loading="lazy" src={src} width="100%" />;
  }
  if (_MEDIA_AUDIO_EXTS.test(clean) || _MEDIA_VIDEO_EXTS.test(clean)) {
    const kind = _MEDIA_AUDIO_EXTS.test(clean) ? "audio" : "video";
    return React.createElement(kind as "audio" | "video", {
      className: `hermes-media-${kind}`,
      src: staticUrl ?? `${apiUrl}&inline=1`, controls: true,
    });
  }
  // HTML files → sandboxed iframe inline preview
  if (_MEDIA_MARKDOWN_EXTS.test(clean)) {
    return <MarkdownMediaPreview fname={fname} ref={ref} sessionId={sessionId} staticUrl={staticUrl} />;
  }
  if (_MEDIA_HTML_EXTS.test(clean)) {
    const htmlUrl = staticUrl ?? `${apiUrl}&inline=1`;
    return (
      <div className="hermes-media-html-container" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <a
          className="hermes-media-html-open"
          href={htmlUrl}
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: "var(--accent,#b8a089)", textDecoration: "underline", marginBottom: 2 }}
          target="_blank"
        >
          Open full page ↗
        </a>
        <iframe
          className="hermes-media-html"
          loading="lazy"
          sandbox="allow-scripts"
          src={htmlUrl}
          style={{ width: "100%", minHeight: 300, border: "1px solid var(--accent,#b8a089)", borderRadius: 8 }}
          title={fname}
        />
      </div>
    );
  }
  // Fallback: download link
  const downloadUrl = staticUrl ?? `${apiUrl}&download=1`;
  return (
    <a className="hermes-media-link" download={fname} href={downloadUrl} rel="noopener noreferrer">
      📎 {fname}
    </a>
  );
}

/** Post-render pass: replace MEDIA placeholder spans with live media elements.
 *  Because react-markdown renders the placeholder as text, we scan all text
 *  nodes in the rendered output via a custom `p`/`span` component override that
 *  splits on the placeholder. We do this purely in React by using a
 *  `preprocessMediaTokens` pass + a custom `text` renderer — but since
 *  react-markdown only gives us string node access via component overrides for
 *  p/li/span, we instead inject placeholders that look like inline code
 *  (`\`\x00MEDIA_0\x00\``) so the `code` component can catch them.
 *  Simpler approach used here: a custom `p` component that splices media nodes. */

/** Splits a paragraph's children and replaces MEDIA placeholder text nodes
 *  with live MediaToken elements. Used as the `p` react-markdown component. */
function MediaAwareParagraph({ children, sessionId }: {
  children?: React.ReactNode;
  sessionId: string;
}) {
  const nodes = React.Children.toArray(children);
  const result: React.ReactNode[] = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      const parts = node.split(new RegExp(`(${MEDIA_PLACEHOLDER_PREFIX}\\d+)`));
            for (const part of parts) {
              const m = part.match(new RegExp(`^${MEDIA_PLACEHOLDER_PREFIX}(\\d+)$`));
        if (m) {
          const entry = _mediaStash[Number(m[1])];
          if (entry) {
            result.push(<MediaToken key={part} ref={entry.ref} sessionId={sessionId} />);
            continue;
          }
        }
        if (part) { result.push(part); }
      }
    } else {
      result.push(node);
    }
  }
  return <p>{result}</p>;
}

// ── Code block copy header ─────────────────────────────────────────────────

/** Recursively collect plain text from a React node tree (hljs spans etc.). */
function collectReactText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") { return String(node); }
  if (Array.isArray(node)) { return node.map(collectReactText).join(""); }
  if (isValidElement(node)) {
    return collectReactText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

/** Recursively collect plain text from a hast node tree (react-markdown `node`). */
function collectHastText(node: unknown): string {
  if (!node || typeof node !== "object") { return ""; }
  const n = node as { value?: unknown; children?: unknown[] };
  if (typeof n.value === "string") { return n.value; }
  if (Array.isArray(n.children)) { return n.children.map(collectHastText).join(""); }
  return "";
}

/** Language from a hast `<pre>` node's first child `<code className=…>`. */
function hastCodeLanguage(node: unknown): string | undefined {
  const pre = node as { children?: unknown[] } | undefined;
  const code = pre?.children?.[0] as { properties?: { className?: unknown } } | undefined;
  const cls = code?.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : cls ? [String(cls)] : [];
  for (const c of list) {
    const m = /^language-([^\s]+)$/.exec(c);
    if (m) { return m[1]; }
  }
  return undefined;
}

/** Renders the copy-button header ABOVE the code block, then the <pre>.
 *  Plugged in via the `pre` component slot: @assistant-ui's CodeOverride
 *  only invokes the `CodeHeader` slot for plain-string code children, which
 *  never happens with rehype-highlight (children become hljs <span>s). The
 *  `pre` slot, by contrast, is used in BOTH paths (WrappedPre inside
 *  DefaultCodeBlockContent), so the header reliably appears. No nested <pre>. */
function CodePre({ node, children, ...rest }: React.ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const [copied, setCopied] = useState(false);
  const language = hastCodeLanguage(node);
  const codeText = collectHastText(node) || collectReactText(children);
  const copy = () => {
    (navigator.clipboard?.writeText(codeText.replace(/\n$/, "")) ?? Promise.reject())
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {/* silent */});
  };
  return (
    <div className="hermes-pre-wrap">
      <div className="hermes-pre-header">
        {language && <span className="hermes-pre-lang">{language}</span>}
        <button
          className={`hermes-code-copy-btn${copied ? "copied" : ""}`}
          onClick={copy}
          type="button"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre {...rest}>{children}</pre>
    </div>
  );
}

/** For plain ReactMarkdown (LiveMarkdown) which has no CodeHeader slot:
 *  render ONLY the <code> element so react-markdown's own <pre> wraps it
 *  cleanly. Copy buttons are added post-render by the native addCopyButtons()
 *  or skipped (live-turn content is ephemeral). */
function InlineOrCode({ className, children, ...rest }: React.ComponentPropsWithoutRef<"code"> & { node?: unknown }) {
  return <code className={className} {...rest}>{children}</code>;
}

/** Strip the host's `\n\n[Attached files: …]` marker (native
 * _stripAttachedFilesMarkerForDisplay) — chips replace it in the bubble. */
function stripAttachedFilesMarker(text: unknown): string {
  return String(text ?? "").replace(/\n\n\[Attached files: [^\]]+\]$/, "").trim();
}

// --------------------------------------------------------------------------
// Native message parity helpers (issue #173): timestamps, role header,
// action footer, inline edit.
// --------------------------------------------------------------------------

/** Per-message metadata recorded from the raw API rows. Keyed by mapped
 * message id in a side map (mirrors attachmentsByMsgIdRef — the store's
 * ThreadMessageLike objects can't carry it without polluting the AUI
 * converter contract). */
interface MessageMeta {
  /** Message timestamp in SECONDS (API `timestamp`, native `m._ts || m.timestamp`). */
  ts?: number;
  /** Absolute raw index in the full session transcript — counts ALL rows
   * (user/assistant/tool), matching the backend's keep_count semantics. */
  rawIdx: number;
  /** Display text for copy / edit / TTS (attachments marker stripped for user). */
  rawText: string;
}

/** Same local calendar day? (native _isSameLocalDay). */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Footer timestamp: same day → time only; older → "Mon d, h:mm AM" (native
 * _formatMessageFooterTimestamp, browser-tz fallback). */
function formatMessageFooterTimestamp(tsVal?: number): string {
  if (!tsVal) { return ""; }
  const date = new Date(tsVal * 1000);
  const now = new Date();
  if (isSameLocalDay(date, now)) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The `.msg-time` span — human footer text + full timestamp as title. */
function TimeSpan({ ts }: { ts?: number }) {
  if (!ts) { return null; }
  const timeText = formatMessageFooterTimestamp(ts);
  if (!timeText) { return null; }
  return (
    <span className="hermes-msg-time" title={new Date(ts * 1000).toLocaleString()}>
      {timeText}
    </span>
  );
}

/** Assistant display name: prefer the host's assistantDisplayName() (native
 * reads S.activeProfile / window._botName), fall back to the brand name. */
function assistantDisplayName(): string {
  try {
    const w = window as unknown as { assistantDisplayName?: () => string };
    if (typeof w.assistantDisplayName === "function") {
      const n = w.assistantDisplayName();
      if (n) { return n; }
    }
  } catch {
    // host function unavailable — fall through to the default
  }
  return "Fox in the Box";
}

/** Lucide icon paths copied verbatim from the host static/icons.js
 * (LI_PATHS) — the same glyphs the native msg-actions use. */
const ICON_PATHS: Record<string, string> = {
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  "rotate-ccw": '<path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.64-4.36L3 8"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  "git-branch": '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  "volume-2": '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
};

/** Inline SVG mirroring the host li() helper (24×24 viewBox, stroke-based). */
function MsgIcon({ name, size = 13 }: { name: string; size?: number }) {
  const inner = ICON_PATHS[name];
  if (!inner) { return null; }
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      style={{ display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0 }}
      viewBox="0 0 24 24"
      width={size}
    >
      {/* Trusted static SVG paths from the host's own icons.js — same-origin
          Vulpy code, never user input. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static same-origin icon paths only */}
      <g dangerouslySetInnerHTML={{ __html: inner }} />
    </svg>
  );
}

/** POST a session action with the extension's CSRF header pattern. */
function postSessionAction(sid: string, path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken() ? { "X-Hermes-CSRF-Token": csrfToken() as string } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ session_id: sid, ...body }),
  });
}

/** Truncate the host's S.messages array in place (native submitEdit does
 * S.messages = S.messages.slice(0, keepCount); in-place splice reaches the
 * same shared array without needing to write the `const S` binding). */
function spliceHostMessages(keepCount: number): void {
  try {
    const hm = hostMessagesSnapshot();
    if (Array.isArray(hm) && hm.length > keepCount) {
      hm.splice(keepCount);
    }
  } catch {
    // non-writable host array — the pane's own store is the source of truth
  }
}

/** Wait (bounded) for the host to finish restoring the selected session.
 * After a refresh the host restores the saved session asynchronously
 * (loadSession); during that window S.session is null and a host send()
 * would spawn a NEW session instead of continuing the selected chat. The
 * host patch (patch-webui-send-wait-session.py) already guards send(); this
 * island-side wait keeps the pane from firing into the boot window at all.
 * Resolves true once the host has a session for the restored sid.
 *
 * S is a global LEXICAL binding in the host's classic scripts (const S —
 * NOT window.S / globalThis.S). Read the bare identifier exactly like
 * hostBusySnapshot()/hostMessagesSnapshot() do, falling back to window.S
 * only for test harnesses. */
async function waitForHostSessionReady(timeoutMs = 4000): Promise<boolean> {
  const targetSid = sessionIdFromHost();
  // No saved session — genuine new chat; nothing to wait for.
  if (!targetSid) { return true; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const host = typeof S === "undefined" ? undefined : S;
      const fromWindow = (window as unknown as {
        S?: { session?: { session_id?: string } | null };
      }).S;
      const hostS = host ?? fromWindow;
      // The host's loadSession() sets S.session atomically with session_id;
      // a truthy S.session means the restore (or a user switch) completed.
      if (hostS?.session) {
        // A session is loaded. Honor whichever is active (a switch during
        // boot wins); never force the send into the stale saved id.
        return true;
      }
    } catch {
      // S not readable — keep waiting.
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  // Host restore did not resolve in time. Do NOT silently fire into the
  // boot window (that used to spawn a fresh session): surface a toast so
  // the operator knows the send was withheld, and let the host send()'s own
  // guard make the final call (it waits itself and only bails to
  // newSession() when no saved session exists).
  try {
    const toast = (globalThis as Record<string, unknown>).showToast;
    if (typeof toast === "function") {
      (toast as (m: string) => unknown)("Session is still restoring — try again in a moment.");
    }
  } catch { /* no toast surface */ }
  return false;
}

/** Fill the host composer and trigger the host send() (mirrors the native
 * submitEdit tail: $('msg').value = newText; await send()). */
function hostSendText(text: string): void {
  try {
    const input = document.getElementById("msg") as HTMLInputElement | null;
    if (input) { input.value = text; }
    const send = (globalThis as Record<string, unknown>).send;
    if (typeof send === "function") {
      // Wait for the host session restore (boot window) before firing, so
      // the message goes to the displayed session — never a fresh one. If
      // the restore times out, waitForHostSessionReady surfaced a toast and
      // resolved false — withhold the send (the host patch's own guard is
      // the final decision-maker for the direct composer path).
      // biome-ignore lint/complexity/noVoid: fire-and-forget host send() after the boot-window wait
      void waitForHostSessionReady().then((ready) => {
        if (!ready) { return; }
        // biome-ignore lint/complexity/noVoid: fire-and-forget host send()
        void (send as () => unknown)();
      });
    }
  } catch {
    // host composer/send unavailable — no-op
  }
}

/** Record per-message meta for one fetched raw window. Absolute raw index =
 * (total - offset - list.length) + position, per the sidecar API slice
 * semantics (offset=0 → newest `limit` rows). */
function indexRawWindow(
  list: readonly ApiMessage[],
  opts: { offset: number; total: number | null },
  out: Map<string, MessageMeta>,
): void {
  const total = typeof opts.total === "number" ? opts.total : 0;
  const base = Math.max(0, total - opts.offset - list.length);
  list.forEach((raw, i) => {
    const role = raw.role;
    if (role !== "user" && role !== "assistant") { return; }
    const id = raw.id;
    if (id === undefined || id === null) { return; }
    const content = typeof raw.content === "string" ? raw.content : stringify(raw.content);
    const ts = raw.timestamp;
    out.set(String(id), {
      ts: typeof ts === "number" && Number.isFinite(ts) ? ts : undefined,
      rawIdx: base + i,
      rawText: role === "user" ? stripAttachedFilesMarker(content) : content.trim(),
    });
  });
}

/** Snapshot of the host's message array. `S` is a global lexical binding in
 * the host's classic scripts (NOT on window); fall back to window.S for test
 * harnesses. */
function hostMessagesSnapshot(): Record<string, unknown>[] | undefined {
  const fromLexical = typeof S === "undefined" ? undefined : S?.messages;
  if (Array.isArray(fromLexical)) { return fromLexical; }
  const fromWindow = (window as unknown as { S?: { messages?: Record<string, unknown>[] } }).S?.messages;
  return Array.isArray(fromWindow) ? fromWindow : undefined;
}

/** Snapshot of the host's busy flag (true from send until completion/failure).
 * Mirrors hostMessagesSnapshot: `S` is a global lexical binding; window.S is
 * the test fallback. */
function hostBusySnapshot(): boolean | undefined {
  const fromLexical = typeof S === "undefined" ? undefined : S?.busy;
  if (typeof fromLexical === "boolean") { return fromLexical; }
  const fromWindow = (window as unknown as { S?: { busy?: unknown } }).S?.busy;
  return typeof fromWindow === "boolean" ? fromWindow : undefined;
}

/** Snapshot of the host's in-flight stream for the CURRENT session, or null.
 * The host re-attaches an already-live stream on session switch WITHOUT
 * re-emitting hermes:run-started (it only sets S.busy=true,
 * S.activeStreamId and S.session.active_stream_id — see
 * _attachServerInitiatedStream / loadSession reattach). This lets the pane
 * re-discover a run that started before the switch (or while we were on
 * another session) and re-arm dots + the EventSource.
 * Session-scoped: the host session must match `sid`, so a stream running in a
 * DIFFERENT thread never lights up this thread (cross-thread leak guard —
 * issue #142 follow-up). */
function hostActiveStreamSnapshot(sid: string): { streamId: string } | null {
  const fromLexical = typeof S === "undefined" ? undefined : S;
  const fromWindow = (window as unknown as {
    S?: { busy?: unknown; activeStreamId?: unknown; session?: { session_id?: unknown; active_stream_id?: unknown } };
  }).S;
  const host = fromLexical ?? fromWindow;
  if (!host) { return null; }
  if (host.busy !== true) { return null; }
  const session = host.session;
  if (!session || session.session_id !== sid) { return null; }
  // Per-session field is authoritative; global activeStreamId is the host's
  // fallback when the session object hasn't been refreshed yet.
  const streamId = String(
    (session.active_stream_id ? session.active_stream_id : host.activeStreamId) ?? "",
  );
  if (!streamId) { return null; }
  return { streamId };
}

function sessionIdFromHost(): string | null {
  try {
    return window.localStorage.getItem("hermes-webui-session");
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Hermes Event Bus (optimistic-UI batch, issue #142).
//
// The HOST (static/messages.js, sessions.js, commands.js, patched at build
// time by patch-webui-event-bus.py) emits lifecycle events on
// window.HermesBus; the pane subscribes. The bus is a singleton: if the host
// already injected it (production build), reuse it; otherwise (tests, split
// mode, extension running standalone) create the same fan-out shape here.
// Two transports: in-process handlers + DOM CustomEvent fallback.
// Live-only, no replay — the settled poll reconciles missed events.
// --------------------------------------------------------------------------
export interface HermesBus {
  emit(type: string, detail: Record<string, unknown>): void;
  subscribe(type: string, handler: (detail: Record<string, unknown>) => void): () => void;
  _handlers: Map<string, Set<(detail: Record<string, unknown>) => void>>;
}

export function ensureHermesBus(): HermesBus {
  const w = window as unknown as { HermesBus?: HermesBus };
  if (w.HermesBus) { return w.HermesBus; }
  const handlers = new Map<string, Set<(detail: Record<string, unknown>) => void>>();
  const bus: HermesBus = {
    emit(type, detail) {
      const set = handlers.get(type);
      if (set) {
        for (const h of set) {
          try { h(detail); } catch { /* handler error — never break the bus */ }
        }
      }
      try {
        window.dispatchEvent(new CustomEvent(type, { detail }));
      } catch {
        // dispatchEvent unavailable (non-window document) — in-process only
      }
    },
    subscribe(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
      return () => { set.delete(handler); };
    },
    _handlers: handlers,
  };
  w.HermesBus = bus;
  return bus;
}

/** Optimistic user bubble rendered before the settled poll catches up. */
interface OptimisticMessage {
  id: string;
  role: "user";
  text: string;
  status: "sending" | "sent";
  ts: number;
  kind: "message" | "steer";
  /** Attachment file names (from host S.session.pending_attachments at emit). */
  attachments?: string[];
}

function optimisticId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function csrfToken(): string | undefined {
  try {
    const cfg = (window as unknown as { __HERMES_CONFIG__?: { csrfToken?: string } })
      .__HERMES_CONFIG__;
    return cfg?.csrfToken;
  } catch {
    return undefined;
  }
}

// --------------------------------------------------------------------------
// Pagination constants — read via functions so tests can override them via
// window globals (mirrors the POLL_INTERVAL_MS lesson).
// --------------------------------------------------------------------------
const TAIL_LIMIT = 40;
const PAGE_LIMIT = 50;

function tailLimit(): number {
  return (window as unknown as { __HERMES_AUI_TAIL_LIMIT?: number }).__HERMES_AUI_TAIL_LIMIT ?? TAIL_LIMIT;
}
function pageLimit(): number {
  return (window as unknown as { __HERMES_AUI_PAGE_LIMIT?: number }).__HERMES_AUI_PAGE_LIMIT ?? PAGE_LIMIT;
}

function sessionMessagesUrl(sessionId: string, opts: { limit: number; offset: number; r?: number; sinceId?: number | null }): string {
  // Single-container: the WebUI serves session messages same-origin via
  // /api/session?session_id=…&messages=1 (no sidecar/8642 dependency). The
  // legacy sidecar path remains as an opt-out for multi-container topologies.
  const useSidecar = (window as unknown as { __HERMES_AUI_USE_SIDECAR__?: boolean }).__HERMES_AUI_USE_SIDECAR__ === true;
  if (useSidecar) {
    return (
      "/api/extensions/message-renderer/sidecar/api/sessions/" +
      encodeURIComponent(sessionId) +
      "/messages?limit=" + opts.limit + "&offset=" + opts.offset +
      (opts.r === undefined ? "" : `&r=${opts.r}`) +
      (opts.sinceId == null ? "" : `&since_id=${opts.sinceId}`)
    );
  }
  return (
    "/api/session?session_id=" + encodeURIComponent(sessionId) +
    "&messages=1&msg_limit=" + opts.limit +
    (opts.offset > 0 ? `&msg_before=${opts.offset}` : "") +
    (opts.r === undefined ? "" : `&r=${opts.r}`)
  );
}

/** Normalize the WebUI /api/session response ({session:{messages,total}}) to the api-server list shape ({data,total}). */
function normalizeSessionMessages(data: unknown): { list: ApiMessage[]; total?: number } {
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const s = raw.session && typeof raw.session === "object" ? (raw.session as Record<string, unknown>) : null;
  if (s && Array.isArray(s.messages)) {
    return {
      list: s.messages as ApiMessage[],
      total: typeof s.message_count === "number" ? s.message_count : undefined,
    };
  }
  if (Array.isArray(raw.data)) {
    return {
      list: raw.data as ApiMessage[],
      total: typeof raw.total === "number" ? (raw.total as number) : undefined,
    };
  }
  return { list: [] };
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) { return ""; }
  if (typeof value === "string") { return value; }
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v), 2);
  } catch {
    return "[unavailable]";
  }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) { return {}; }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return { raw };
    }
  }
  return typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function isErrorResult(value: unknown): boolean {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (obj.error || obj.is_error || obj.isError) { return true; }
      }
    } catch {
      // plain text — not an error marker
    }
  }
  return false;
}

/** Map a raw API-server session message list into ThreadMessageLike[]. */
function mapApiMessages(messages: readonly ApiMessage[]): ThreadMessageLike[] {
  // Fold role:"tool" rows into their tool-call parts (keyed by tool_call_id).
  const resultsByCallId = new Map<string, unknown>();
  for (const m of messages) {
    if (m.role === "tool" && m.tool_call_id) {
      resultsByCallId.set(m.tool_call_id, m.content);
    }
  }

  const out: ThreadMessageLike[] = [];
  for (const raw of messages) {
    const role = raw.role === "user" ? "user" : raw.role === "assistant" ? "assistant" : null;
    if (!role) { continue; // system/tool rows are folded or skipped
}

    const parts: Array<
      Record<string, unknown> & {
        type: "text" | "reasoning" | "tool-call";
      }
    > = [];

    const reasoning = raw.reasoning_content ?? raw.reasoning;
    if (typeof reasoning === "string" && reasoning.trim()) {
      parts.push({ type: "reasoning", text: reasoning });
    }

    const calls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
    for (const call of calls) {
      const fn = call.function ?? {};
      const toolName = String(call.name || fn.name || raw.tool_name || "tool");
      const args = parseArgs(fn.arguments ?? call.arguments);
      const toolCallId = String(call.id || call.call_id || `call-${out.length}`);
      const result = resultsByCallId.get(toolCallId);
      const toolPart: Record<string, unknown> & { type: "tool-call" } = {
        type: "tool-call",
        toolCallId,
        toolName,
        args,
        argsText: stringify(args),
      };
      if (result !== undefined) {
        toolPart.result = result;
        if (isErrorResult(result)) { toolPart.isError = true; }
      }
      parts.push(toolPart);
    }

    if (typeof raw.content === "string" && raw.content.trim()) {
      // File sends persist `text\n\n[Attached files: …]` — strip the marker so
      // the settled row displays like the optimistic bubble (chips carry it).
      const display = role === "user" ? stripAttachedFilesMarker(raw.content) : String(raw.content).trim();
      if (display) { parts.push({ type: "text", text: display }); }
    } else if (raw.content !== undefined && raw.content !== null && typeof raw.content !== "string") {
      const text = stringify(raw.content);
      if (text.trim()) { parts.push({ type: "text", text }); }
    }

    const message: ThreadMessageLike = {
      id: String(raw.id ?? `msg-${out.length}`),
      role,
      content: parts as unknown as ThreadMessageLike["content"] as never,
      // A live assistant message has no finish_reason yet — mark running so
      // the native cursor shows while the host streams.
      ...(role === "assistant" && !raw.finish_reason
        ? { status: { type: "running" as const } }
        : {}),
    };
    out.push(message);
  }
  return out;
}

// --------------------------------------------------------------------------
// Cheap content compare for the settled-poll reconcile (freeze fix).
//
// The settle poll previously did `JSON.stringify(m.content) ===
// JSON.stringify(n.content)` for EVERY message on EVERY tick — O(n·content)
// main-thread work that froze the pane for large sessions. `sameContent` is
// a cheap per-part text fingerprint that is only ever invoked on the FEW
// rows that are fresh in a given poll (never the whole history), so the
// typical empty-delta case is O(1)-ish.
// --------------------------------------------------------------------------
const partText = (p: unknown): string => {
  if (!p || typeof p !== "object") { return String(p ?? ""); }
  const rec = p as Record<string, unknown>;
  const type = typeof rec.type === "string" ? rec.type : "";
  if (type === "text" || type === "reasoning") {
    return `${type}:${typeof rec.text === "string" ? rec.text : ""}`;
  }
  const toolCallId = typeof rec.toolCallId === "string" ? rec.toolCallId : "";
  const toolName = typeof rec.toolName === "string" ? rec.toolName : "";
  const argsText = typeof rec.argsText === "string" ? rec.argsText : "";
  const result = rec.result === undefined ? "" : stringify(rec.result);
  const isError = rec.isError ? "err" : "";
  return `${type}:${toolCallId}:${toolName}:${argsText}:${result}:${isError}`;
};

/** Stable content compare between two rendered rows — never stringifies the
 * whole history, only the content parts of the two rows in question. */
function sameContent(a: ThreadMessageLike, b: ThreadMessageLike): boolean {
  const pa = a.content as unknown as unknown[];
  const pb = b.content as unknown as unknown[];
  if (!(((pa && pb ) && Array.isArray(pa) ) && Array.isArray(pb))) {
    return JSON.stringify(pa) === JSON.stringify(pb);
  }
  if (pa.length !== pb.length) { return false; }
  for (let i = 0; i < pa.length; i++) {
    if (partText(pa[i]) !== partText(pb[i])) { return false; }
  }
  return true;
}

// --------------------------------------------------------------------------
// Headless message rendering: ThreadPrimitive + MessagePrimitive parts.
// --------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  running: "running…",
  complete: "done",
  error: "failed",
  cancelled: "cancelled",
  approval: "approval required",
  malformed: "unavailable",
};

function statusColor(status: string): string {
  switch (status) {
    case "running":
      return "var(--accent)";
    case "complete":
      return "var(--success, #22c55e)";
    case "error":
      return "var(--error, #ef4444)";
    case "cancelled":
      return "var(--muted)";
    case "approval":
      return "var(--warning, #f59e0b)";
    default:
      return "var(--muted)";
  }
}

/** True while a tool-call part renders inside a <ToolGroup>. */
const ToolGroupContext = createContext(false);

// --------------------------------------------------------------------------
// Frontend tools — charts rendered client-side from the tool-call args.
// The registry (frontend-tools/registry.json) is the single source of truth:
// it ships into the image for the gateway system-prompt injection AND is
// imported here at build time. ToolPart routes registered frontend tools to
// FrontendChartCard; everything else keeps the generic card below.
// --------------------------------------------------------------------------

export interface FrontendToolDef {
  name: string;
  description: string;
  renderer: string;
}

/** name → definition lookup built at build time from the registry. */
export const frontendToolByName = new Map<string, FrontendToolDef>(
  (frontendToolsRegistry.tools ?? []).map((t): [string, FrontendToolDef] => [
    t.name,
    { name: t.name, description: t.description, renderer: t.renderer },
  ]),
);

type ChartType = "line" | "bar" | "pie" | "area";

interface ChartDatum {
  label: string;
  value: number;
}

interface ParsedChartArgs {
  valid: boolean;
  chartType: ChartType;
  title: string;
  data: ChartDatum[];
  color?: string;
  xLabel?: string;
  yLabel?: string;
}

const CHART_HEIGHT = 220;
/**
 * Vulpy brand palette (design tokens: tokens.reference.color.*): terracotta
 * primary #c8743a, success #1a8245, danger #b60802, warning #d97706, brand
 * brown #917964, ink #32302e. Distinct hues, ≥3:1 on the pane's light
 * surface — keep it accessible when extending.
 */
const CHART_PALETTE = ["#c8743a", "#1a8245", "#b60802", "#d97706", "#917964", "#32302e"];

/** Defensively parse JSON into an object; never throws. */
function tryParseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Normalize tool args from any stream shape: dict passthrough, JSON string →
 * object, anything else → {}. The gateway serializes `function_args` to a
 * JSON string on some paths, so renderers must not assume an object.
 */
export function normalizeToolArgs(raw: unknown): Record<string, unknown> {
  const obj = typeof raw === "string" ? tryParseJsonObject(raw) : raw;
  return obj !== null && typeof obj === "object" && !Array.isArray(obj)
    ? (obj as Record<string, unknown>)
    : {};
}

/**
 * Parse a value that the model/gateway may have stringified into a plain
 * object — JSON strings AND Python-repr strings (single quotes, seen when a
 * Python layer str()'d a nested dict/list, e.g. "{'label': 'Jan', ...}").
 * Returns {} on anything unrecognizable. Never throws.
 */
function parseMaybeObject(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || raw.trim() === "") { return {}; }
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = tryParseJsonObject(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    // Python-repr dict: extract simple key: value pairs (string or number).
    const out: Record<string, unknown> = {};
    const keyRe = /'([^']+)'\s*:\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?))/g;
    let m: RegExpExecArray | null;
    while ((m = keyRe.exec(trimmed)) !== null) {
      out[m[1]] = m[2] === undefined ? m[3] === undefined ? Number(m[4]) : m[3] : m[2];
    }
    return out;
  }
  return {};
}

/**
 * Parse the chart `data` field: an array, a JSON-stringified array, or a
 * Python-repr stringified list of {label, value} dicts. Invalid rows are
 * dropped; a non-parseable payload yields [] (never throws).
 */
export function parseChartData(raw: unknown): ChartDatum[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      const parsed = tryParseJsonObject(trimmed);
      if (Array.isArray(parsed)) { items = parsed; }
      else {
        // Python-repr list of dicts: each {..} object becomes a datum.
        const objRe = /\{([^{}]*)\}/g;
        let m: RegExpExecArray | null;
        while ((m = objRe.exec(trimmed)) !== null) {
          items.push(parseMaybeObject(`{${m[1]}}`));
        }
      }
    }
  }
  const data: ChartDatum[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") { continue; }
    const o = item as Record<string, unknown>;
    const value = typeof o.value === "number" && Number.isFinite(o.value) ? o.value : Number.NaN;
    if (Number.isNaN(value)) { continue; }
    const label = typeof o.label === "string" ? o.label : o.label == null ? "" : String(o.label);
    data.push({ label, value });
  }
  return data;
}

/** Defensively parse tool-call args. Never throws; invalid → empty state. */
export function parseChartArgs(raw: unknown): ParsedChartArgs {
  const args = normalizeToolArgs(raw);
  const chartType = args.chart_type;
  const title = typeof args.title === "string" ? args.title.trim() : "";
  const data = parseChartData(args.data);
  const valid =
    (chartType === "line" || chartType === "bar" || chartType === "pie" || chartType === "area") &&
    title !== "" &&
    data.length > 0;
  const options = parseMaybeObject(args.options);
  const color = typeof options.color === "string" && options.color.trim() !== "" ? options.color : undefined;
  const xLabel = typeof options.x_label === "string" && options.x_label.trim() !== "" ? options.x_label : undefined;
  const yLabel = typeof options.y_label === "string" && options.y_label.trim() !== "" ? options.y_label : undefined;
  return {
    valid,
    chartType: valid ? (chartType as ChartType) : "bar",
    title,
    data,
    color,
    xLabel,
    yLabel,
  };
}

/**
 * Compact Vulpy-styled tooltip. Replaces the default recharts box (which
 * rendered as a thick rounded block that followed taps on mobile) and the
 * full-height cursor band (`cursor={false}` on every Tooltip).
 */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: unknown; name?: string }>; label?: string }) {
  if (!(active && payload ) || payload.length === 0) { return null; }
  const value = payload[0]?.value;
  return (
    <div className="hermes-chart-tooltip">
      {label !== undefined && label !== "" && <span className="hermes-chart-tooltip-label">{label}</span>}
      <span className="hermes-chart-tooltip-value">{typeof value === "number" ? value.toLocaleString() : String(value ?? "")}</span>
    </div>
  );
}

function ChartBody({ parsed }: { parsed: ParsedChartArgs }) {
  const color = parsed.color ?? CHART_PALETTE[0];
  const { data } = parsed;
  const tooltip = <Tooltip content={<ChartTooltip />} cursor={false} />;
  if (parsed.chartType === "pie") {
    return (
      <ResponsiveContainer height={CHART_HEIGHT} width="100%" >
        <PieChart accessibilityLayer={false}>
          <Pie
            cx="50%"
            cy="50%"
            data={data}
            dataKey="value"
            isAnimationActive={false}
            label
            nameKey="label"
            outerRadius={78}
            rootTabIndex={-1}
          >
            {data.map((d) => (
              <Cell fill={CHART_PALETTE[data.indexOf(d) % CHART_PALETTE.length]} key={`${d.label}:${d.value}`} />
            ))}
          </Pie>
          {tooltip}
        </PieChart>
      </ResponsiveContainer>
    );
  }
  const xAxis = (
    <XAxis
      axisLine={false}
      dataKey="label"
      fontSize={10}
      interval="preserveStartEnd"
      label={parsed.xLabel ? { value: parsed.xLabel, position: "insideBottom", offset: -2, fontSize: 10 } : undefined}
      tickLine={false}
    />
  );
  // No in-axis y label (it overlapped the tick values on narrow screens) —
  // the unit renders as a muted chip next to the chart title instead.
  const yAxis = (
    <YAxis
      axisLine={false}
      fontSize={10}
      tickLine={false}
      width={40}
    />
  );
  if (parsed.chartType === "bar") {
    return (
      <ResponsiveContainer height={CHART_HEIGHT} width="100%" >
        <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          {xAxis}
          {yAxis}
          {tooltip}
          <Bar dataKey="value" isAnimationActive={false} name={parsed.yLabel ?? "value"} radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell fill={parsed.color ?? CHART_PALETTE[data.indexOf(d) % CHART_PALETTE.length]} key={`${d.label}:${d.value}`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (parsed.chartType === "area") {
    return (
      <ResponsiveContainer height={CHART_HEIGHT} width="100%" >
        <AreaChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          {xAxis}
          {yAxis}
          {tooltip}
          <Area
            dataKey="value"
            fill={color}
            fillOpacity={0.18}
            isAnimationActive={false}
            name={parsed.yLabel ?? "value"}
            stroke={color}
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer height={CHART_HEIGHT} width="100%" >
      <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        {xAxis}
        {yAxis}
        <Tooltip content={<ChartTooltip />} cursor={false} />
        <Line
          dataKey="value"
          dot={{ r: 3 }}
          isAnimationActive={false}
          name={parsed.yLabel ?? "value"}
          stroke={color}
          strokeWidth={2}
          type="monotone"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Render a frontend tool call as a client-side chart card. PURE: reads only
 * the tool-call args — no window/browser reads, no network, no analytics, no
 * DOM mutation outside the card. The chart renders from args immediately, so
 * it shows even while the tool is still `running`.
 */
function FrontendChartCard({ toolName, args, result }: FrontendToolRenderProps) {
  const parsed = parseChartArgs(args);
  return (
    <div className="hermes-frontend-chart" data-badge="frontend" data-frontend-tool={toolName}>
      {parsed.valid ? (
        <>
          <div className="hermes-frontend-chart-head">
            <span className="hermes-frontend-chart-title">{parsed.title}</span>
            {parsed.yLabel && <span className="hermes-frontend-chart-unit">{parsed.yLabel}</span>}
          </div>
          <ChartBody parsed={parsed} />
        </>
      ) : (
        <div className="hermes-frontend-chart-empty">No data provided</div>
      )}
    </div>
  );
}

/**
 * Generic inline body for frontend tools that are not charts: the result (or
 * args while running) rendered as plain content, chrome-free, like a markdown
 * block. Extend per-renderer by dispatching on frontendTool.renderer.
 */
function GenericFrontendToolBody({ args, result }: FrontendToolRenderProps) {
  const argsText = stringify(args);
  const resultText = stringify(result);
  const content = resultText || (argsText && argsText !== "{}" ? argsText : "");
  if (!content) { return null; }
  return <pre className="hermes-tool-result">{content}</pre>;
}

/** Shared props for all frontend-tool renderers (registry `renderer` field). */
export interface FrontendToolRenderProps {
  toolName: string;
  args: unknown;
  /** Present after the tool completes; renderers may ignore it. */
  result?: unknown;
}

/**
 * Renderer registry — keyed by the `renderer` field in frontend-tools/registry.json.
 * Adding a new frontend tool is: 1) add the entry to registry.json (name,
 * description, schema, renderer), 2) register/choose a renderer here.
 * `text` renders the result as plain content; `chart` renders a client chart.
 * Unknown renderer values fall back to `text` (never a crash).
  */
type PreviewType = "html" | "svg" | "image" | "audio" | "video";

export interface ParsedPreviewArgs {
  valid: boolean;
  type: PreviewType;
  path: string;
  title: string;
}

const PREVIEW_TYPES: ReadonlySet<string> = new Set(["html", "svg", "image", "audio", "video"]);
const MAX_PREVIEW_TITLE_LENGTH = 120;

/** Parse an untrusted tool call. Invalid preview calls are displayable errors, never exceptions. */
export function parsePreviewArgs(raw: unknown): ParsedPreviewArgs {
  const args = normalizeToolArgs(raw);
  const type = typeof args.type === "string" ? args.type : "";
  const path = typeof args.path === "string" ? args.path.trim() : "";
  const suppliedTitle = typeof args.title === "string" ? args.title.trim() : "";
  const valid = PREVIEW_TYPES.has(type) && path.startsWith("/") && !path.includes("\0") &&
    (!suppliedTitle || suppliedTitle.length <= MAX_PREVIEW_TITLE_LENGTH);
  return {
    valid,
    type: (PREVIEW_TYPES.has(type) ? type : "html") as PreviewType,
    path,
    title: suppliedTitle || path.split("/").filter(Boolean).pop() || "preview",
  };
}

/** Build the only preview fetch URL; content is never passed through tool arguments. */
export function buildPreviewMediaUrl(path: string, sessionId: string | null): string {
  const query = `path=${encodeURIComponent(path)}`;
  const session = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : "";
  return `api/media?${query}${session}&inline=1`;
}

function PreviewErrorCard({ message }: { message: string }) {
  return <output className="hermes-frontend-chart-empty">Preview unavailable: {message}</output>;
}

/** Safe file-on-disk preview: HTML stays in a sandbox and other media use native elements. */
export function FrontendPreviewCard({ toolName, args }: FrontendToolRenderProps) {
  const parsed = parsePreviewArgs(args);
  const [loadError, setLoadError] = useState(false);
  if (!parsed.valid) { return <PreviewErrorCard message="invalid preview request" />; }
  if (loadError) { return <PreviewErrorCard message="the file could not be loaded" />; }
  const src = buildPreviewMediaUrl(parsed.path, sessionIdFromHost());
  const onError = () => setLoadError(true);
  if (parsed.type === "svg" || parsed.type === "image") {
    // biome-ignore lint/correctness/useImageSize: intrinsic media sizing by design
    return <img alt={parsed.title} className="hermes-media-img" loading="lazy" onError={onError} src={src} style={{ maxWidth: "100%", height: "auto" }} />;
  }
  if (parsed.type === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: operator-supplied audio, no caption source
    return <audio className="hermes-media-audio" controls onError={onError} src={src} />;
  }
  if (parsed.type === "video") {
    // biome-ignore lint/a11y/useMediaCaption: operator-supplied video, no caption source
    return <video className="hermes-media-video" controls onError={onError} src={src} />;
  }
  return (
    <div className="hermes-frontend-sandbox" data-badge="frontend" data-frontend-tool={toolName}>
      <div className="hermes-frontend-sandbox-header">
        <span className="hermes-frontend-sandbox-title">{parsed.title}</span>
        <span className="hermes-frontend-sandbox-badge">&#9888; sandbox</span>
      </div>
      <iframe className="hermes-frontend-sandbox-iframe" loading="lazy" onError={onError} sandbox="allow-scripts"
        src={src} style={{ width: "100%", height: 400, border: "none", borderRadius: "0 0 8px 8px" }} title={parsed.title} />
    </div>
  );
}

interface FrontendToolBoundaryProps { children: ReactNode; }
interface FrontendToolBoundaryState { failed: boolean; }

/** A bad third-party/media renderer must not unmount the entire transcript. */
export class FrontendToolErrorBoundary extends Component<FrontendToolBoundaryProps, FrontendToolBoundaryState> {
  state: FrontendToolBoundaryState = { failed: false };
  static getDerivedStateFromError(): FrontendToolBoundaryState { return { failed: true }; }
  componentDidCatch() { /* The recoverable card below is intentionally silent. */ }
  render() {
    return this.state.failed ? <PreviewErrorCard message="the preview renderer failed" /> : this.props.children;
  }
}

 export const frontendRenderers: Record<string, ComponentType<FrontendToolRenderProps>> = {
   chart: FrontendChartCard,
   preview: FrontendPreviewCard,
 };

function ToolPart({ toolCallId, toolName, args, result, isError }: ToolCallMessagePartProps) {
  const inGroup = useContext(ToolGroupContext);
  const argsText = stringify(args);
  const resultText = stringify(result);
  const status = isError ? "error" : result === undefined ? "running" : "complete";
  const frontendTool = toolName ? frontendToolByName.get(String(toolName)) : undefined;
  const statusNode = (
    <span className="hermes-tool-card-status" data-status={status} style={{ color: statusColor(status) }}>
      {STATUS_LABEL[status]}
    </span>
  );
  if (frontendTool) {
    // Frontend tools render inline as part of the output — the result IS the
    // output, like a markdown figure. No name/badge/status chrome and never
    // a collapsed <details>. Renderer is registry-driven: every tool in the
    // frontend registry dispatches through frontendRenderers[renderer].
    const toolLabel = String(toolName || "Tool");
    const Renderer = frontendRenderers[frontendTool.renderer] ?? GenericFrontendToolBody;
    return (
      <div className="hermes-frontend-tool-card" data-badge="frontend" data-frontend-tool={toolLabel}>
        <FrontendToolErrorBoundary>
          <Renderer args={args} result={result} toolName={toolLabel} />
        </FrontendToolErrorBoundary>
      </div>
    );
  }
  if (inGroup) {
    // Row inside a ToolGroup card: name + status + payload inline.
    return (
      <div className="hermes-tool-group-row" data-status={status} data-tool-call-id={toolCallId}>
        <div className="hermes-tool-group-row-head">
          <svg aria-hidden className="hermes-tool-card-chevron" fill="none" viewBox="0 0 12 12">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
          <span className="hermes-tool-card-name">{String(toolName || "Tool")}</span>
          {statusNode}
        </div>
        {(argsText && argsText !== "{}" || resultText) && (
          <div className="hermes-tool-card-body">
            {argsText && argsText !== "{}" && <pre>{argsText}</pre>}
            {resultText && <pre className="hermes-tool-result">{resultText}</pre>}
          </div>
        )}
      </div>
    );
  }
  return (
    <details className="hermes-tool-card" data-status={status} data-tool-call-id={toolCallId}>
      <summary>
        <svg aria-hidden className="hermes-tool-card-chevron" fill="none" viewBox="0 0 12 12">
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
        <span className="hermes-tool-card-name">{String(toolName || "Tool")}</span>
        {statusNode}
      </summary>
      <div className="hermes-tool-card-body">
        {argsText && argsText !== "{}" && <pre>{argsText}</pre>}
        {resultText && <pre className="hermes-tool-result">{resultText}</pre>}
        {!(argsText || resultText) && (
          <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
            {status === "running" ? "waiting for result…" : "no payload"}
          </span>
        )}
      </div>
    </details>
  );
}

/**
 * Native ToolGroup slot: wraps consecutive NON-frontend tool-call parts in one
 * expandable card. Frontend tool parts are pulled out of the collapsed group
 * and render inline (ToolPart's frontend fast-path) — a frontend result is
 * output, never chrome. Children are the per-call ToolParts; ToolGroupContext
 * flips the grouped ones into compact row mode. A lone non-frontend tool
 * renders unwrapped (children as-is).
 */
function ToolGroup({
  startIndex,
  endIndex,
  children,
}: {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
}) {
  // Slot contract: the runtime passes the part span. Defensive guard only —
  // the split below decides what to collapse.
  if (endIndex < startIndex) { return <>{children}</>; }
  // Children are <MessagePrimitive.PartByIndex index={i} …/> elements; the
  // store's parts array maps index → part, which is the only place toolName
  // is available (child props do not carry it).
  const messageParts = useAuiState((s) => s.message.parts);
  const parts = Children.toArray(children);
  const isFrontendChild = (child: ReactNode): boolean => {
    if (!isValidElement(child)) { return false; }
    const index = (child.props as { index?: number }).index;
    if (typeof index !== "number" || index < 0 || index >= messageParts.length) { return false; }
    const part = messageParts[index];
    return part.type === "tool-call" && frontendToolByName.has(part.toolName);
  };
  const frontendParts = parts.filter(isFrontendChild);
  const otherParts = parts.filter((child) => !isFrontendChild(child));
  if (otherParts.length === 0) {
    // Every tool in this run is a frontend tool — nothing to collapse.
    return <>{frontendParts}</>;
  }
  if (otherParts.length === 1) {
    // A lone non-frontend tool keeps the standalone card; frontend tools stay
    // inline above it (never inside a collapsed container).
    return (
      <>
        {frontendParts}
        <ToolGroupContext.Provider value={false}>{otherParts}</ToolGroupContext.Provider>
      </>
    );
  }
  return (
    <>
      {frontendParts}
      <details className="hermes-tool-group" data-tool-group-count={otherParts.length}>
        <summary>
          <svg aria-hidden className="hermes-tool-card-chevron" fill="none" viewBox="0 0 12 12">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
          <span className="hermes-tool-group-title">{otherParts.length} tool calls</span>
        </summary>
        <div className="hermes-tool-group-body">
          <ToolGroupContext.Provider value={true}>{otherParts}</ToolGroupContext.Provider>
        </div>
      </details>
    </>
  );
}

/** Native `.thinking-card` parity: ONE collapsed accordion per assistant
 * turn holding ALL of that turn's reasoning (live episodes accumulate here;
 * tool boundaries do NOT mint extra cards). Collapsed = concise summary row
 * (label + snippet + size hint); expanded = the full accumulated text.
 * Default CLOSED — the browser owns `open`, so a user-expanded card survives
 * re-renders (constant `open={false}` never writes the DOM attribute twice).
 *
 * Memoized (streaming-freeze fix): sealed reasoning cards are rendered from
 * stable `turn.segments`, so their subtree must NOT be re-built on every
 * token event. React.memo with a text comparator keeps sealed cards rendered
 * once; the `live` streamed variant always re-renders so the visible
 * reasoning continues to update token-by-token. */
function reasoningWordCount(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function reasoningSnippet(text: string, max = 96): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

const ReasoningCard = memo(
  function ReasoningCardInner({ text, live = false }: { text: string; live?: boolean }) {
    const [_copied, setCopied] = useState(false);
    const copy = () => {
      (navigator.clipboard?.writeText(text.replace(/\n$/, "")) ?? Promise.reject())
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
        .catch(() => {/* silent — same policy as code-block copy */});
    };
    const words = reasoningWordCount(text);
    return (
      <details className={`hermes-reasoning-card${live ? "live" : ""}`} open={false}>
        <summary>
          <svg aria-hidden fill="none" height="14" viewBox="0 0 24 24" width="14">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.2 6H8.2C6.3 13.7 5 11.5 5 9a7 7 0 0 1 7-7z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="9" x2="15" y1="17" y2="17" />
            <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="10" x2="14" y1="20" y2="20" />
          </svg>
          <span className="hermes-reasoning-label">Thinking</span>
          <span className="hermes-reasoning-snippet">{reasoningSnippet(text)}</span>
          {words > 0 && (
            <span className="hermes-reasoning-meta">
              {words} {words === 1 ? "word" : "words"}
            </span>
          )}
          <span className="hermes-reasoning-btn-row">
            <button
              aria-label="Copy"
              className="hermes-reasoning-copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(); }}
              title="Copy"
              type="button"
            >
              <svg aria-hidden fill="none" height="12" viewBox="0 0 24 24" width="12">
                <rect height="13" rx="2" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" width="13" x="9" y="9" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
            </button>
            <svg aria-hidden className="hermes-reasoning-toggle" fill="none" height="12" viewBox="0 0 12 12" width="12">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
          </span>
        </summary>
        <div className="hermes-reasoning-body"><pre>{text}</pre></div>
      </details>
    );
  },
  // Sealed cards: re-render only when text changes. The live streaming card
  // must always re-render so it keeps updating — treat it as always-changed.
  (prev, next) => (prev.live === next.live) && prev.text === next.text && !prev.live,
);

/** Settled reasoning part (assistant-ui parts renderer). */
function ReasoningPart({ text }: ReasoningMessagePartProps) {
  return <ReasoningCard text={text} />;
}

// MarkdownTextPrimitive renders a div; we scope typography via .hermes-md.
// smooth: false for settled/historical messages (no re-animation on poll).
// The live-turn render path passes smooth=true with a duration-capped
// SmoothOptions so streamed deltas reveal char-by-char while live.
function MarkdownText({ text: _text, smooth = false }: { text: string; smooth?: boolean }) {
  const sid = sessionIdFromHost() ?? "";
  return (
    <MarkdownTextPrimitive
      className="hermes-md"
      components={{
        // CodeHeader slot only fires for plain-string code children (never
        // with rehype-highlight — children become hljs <span>s). The `pre`
        // slot fires in both paths, so wrap the code block with the header.
        pre: CodePre,
        // Paragraphs: splice MEDIA: placeholders into live media elements
        p: ({ children, ...rest }: React.ComponentPropsWithoutRef<"p">) => (
          <MediaAwareParagraph sessionId={sid} {...rest}>{children}</MediaAwareParagraph>
        ),
      }}
      preprocess={preprocessMediaTokens}
      rehypePlugins={[rehypeHighlight]}
      remarkPlugins={[remarkGfm]}
      smooth={smooth ? { drainMs: 300, maxCharIntervalMs: 12, maxCharsPerFrame: 60 } : false}
    />
  );
}

/** Optimistic user bubble (host-emitted send/steer shown before the poll). */

/** Inline edit surface (native .msg-edit-area / .msg-edit-bar): textarea with
 * auto-resize, Enter (no Shift) submits, Escape cancels. Uncontrolled —
 * mirrors native, which reads ta.value at submit. */
function InlineEditArea({ rawText, busy, onCancel, onSubmit }: {
  rawText: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const autoResize = () => {
    const ta = ref.current;
    if (!ta) { return; }
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
  };
  useEffect(() => {
    const ta = ref.current;
    if (ta) {
      requestAnimationFrame(() => {
        autoResize();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    }
    // mount-only: focus + caret at end once the textarea is in the DOM
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect; autoResize intentionally excluded
  }, [autoResize]);
  const submit = () => {
    const text = ref.current?.value.trim() ?? "";
    if (!text || busy) { return; }
    onSubmit(text);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };
  return (
    <>
      <textarea
        className="hermes-msg-edit-area"
        defaultValue={rawText}
        onInput={autoResize}
        onKeyDown={onKeyDown}
        ref={ref}
      />
      <div className="hermes-msg-edit-bar">
        <button className="hermes-msg-edit-cancel" onClick={onCancel} type="button">Cancel</button>
        <button className="hermes-msg-edit-send" disabled={busy} onClick={submit} type="button">
          {busy ? "Sending…" : "Send edit"}
        </button>
      </div>
    </>
  );
}

/** Footer shared by settled user/assistant rows (native .msg-foot): timestamp
 * + hover-reveal action buttons. While editing, the footer is replaced by the
 * inline edit surface. */
function MessageFoot({
  meta,
  role,
  isLastUser,
  isLastAssistant,
  editing,
  busy,
  editBusy,
  copied,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onCopy,
  onFork,
  onRegenerate,
  onUndo,
}: {
  meta?: MessageMeta;
  role: "user" | "assistant";
  isLastUser: boolean;
  isLastAssistant: boolean;
  editing: boolean;
  busy: boolean;
  editBusy: boolean;
  copied: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (text: string) => void;
  onCopy: () => void;
  onFork: () => void;
  onRegenerate: () => void;
  onUndo: () => void;
}) {
  if (editing) {
    return <InlineEditArea busy={editBusy} onCancel={onCancelEdit} onSubmit={onSubmitEdit} rawText={meta?.rawText ?? ""} />;
  }
  if (!meta) { return null; }

  const ttsAvailable = typeof (globalThis as Record<string, unknown>).speakMessage === "function";
  const editBtn = isLastUser ? (
    <button aria-label="Edit message" className="hermes-msg-action-btn" onClick={onStartEdit} title="Edit message" type="button">
      <MsgIcon name="pencil" />
    </button>
  ) : null;
  const undoBtn = isLastAssistant ? (
    <button aria-label="Undo exchange" className="hermes-msg-action-btn" onClick={onUndo} title="Undo exchange" type="button">
      <MsgIcon name="undo" />
    </button>
  ) : null;
  const retryBtn = isLastAssistant ? (
    <button aria-label="Regenerate" className="hermes-msg-action-btn" onClick={onRegenerate} title="Regenerate" type="button">
      <MsgIcon name="rotate-ccw" />
    </button>
  ) : null;
  const copyBtn = (
    <button
      aria-label="Copy"
      className={`hermes-msg-action-btn${copied ? "copied" : ""}`}
      onClick={onCopy}
      title="Copy"
      type="button"
    >
      <MsgIcon name={copied ? "check" : "copy"} />
    </button>
  );
  const forkBtn = (
    <button aria-label="Fork from here" className="hermes-msg-action-btn" onClick={onFork} title="Fork from here" type="button">
      <MsgIcon name="git-branch" />
    </button>
  );
  const ttsBtn = role === "assistant" && ttsAvailable ? (
    <button
      aria-label="Listen"
      className="hermes-msg-action-btn"
      onClick={(e) => {
        // Host TTS (native speakMessage(this)) — reads the row's data-raw-text.
        try {
          const hostSpeak = (globalThis as Record<string, unknown>).speakMessage;
          if (typeof hostSpeak === "function") { (hostSpeak as (b: HTMLElement) => unknown)(e.currentTarget); }
        } catch {
          // host TTS unavailable — no-op
        }
      }}
      title="Listen"
      type="button"
    >
      <MsgIcon name="volume-2" />
    </button>
  ) : null;
  // Native button order: edit, tts, fork, copy, undo, retry (the upstream
  // footer builder computes undo but omits it from the DOM — we include it).
  return (
    <div className="hermes-msg-foot">
      <TimeSpan ts={meta.ts} />
      <span className="hermes-msg-actions">
        {editBtn}
        {ttsBtn}
        {forkBtn}
        {copyBtn}
        {undoBtn}
        {retryBtn}
      </span>
    </div>
  );
}

/** Assistant role header (native .msg-role assistant): fox avatar + name. */
function AssistantRoleHeader() {
  const name = assistantDisplayName();
  return (
    <div className="hermes-msg-role assistant">
      <img
        alt={name}
        className="role-icon assistant app-avatar"
        decoding="async"
        height="20"
        src="/extensions/images/fox_avatar_cropped.jpg"
        width="20"
      />
      <span className="hermes-msg-role-name">{name}</span>
    </div>
  );
}

/** Attachment chips — mimics native WebUI `.msg-files` / `.msg-file-badge`.
 * Image attachments render as thumbnails; everything else as a paperclip
 * badge linking to `api/file/raw?session_id=…&path=<basename>`. */
function AttachmentChips({ names, sessionId }: { names: string[]; sessionId?: string | null }) {
  if (names.length === 0) { return null; }
  const sid = sessionId || sessionIdFromHost() || "";
  return (
    <div className="hermes-msg-files">
      {names.map((f) => {
        const fname = String(f).split("/").pop() || String(f);
        const fileUrl = `api/file/raw?session_id=${encodeURIComponent(sid)}&path=${encodeURIComponent(fname)}`;
        if (isImageName(fname)) {
          return (
            <img
              alt={fname}
              className="hermes-msg-media-img"
              height={120}
              key={f}
              loading="lazy"
              src={fileUrl}
              width={180}
            />
          );
        }
        return (
          <div className="hermes-msg-file-badge" key={f}>
            <svg aria-hidden fill="none" height="12" viewBox="0 0 12 12" width="12">
              <path d="M6.5 1.5H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 10.5h4a1.5 1.5 0 0 0 1.5-1.5V4L6.5 1.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
              <path d="M6.5 1.5V4h2.5" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
            </svg>
            {fname}
          </div>
        );
      })}
    </div>
  );
}

function OptimisticMessageView({ message, entry }: { message: ThreadMessageLike; entry?: OptimisticMessage }) {
  const kind = entry?.kind ?? "message";
  const attachments = entry?.attachments ?? [];
  const textPart = Array.isArray(message.content)
    ? message.content.find((p): p is { type: "text"; text: string } => (p as { type?: string }).type === "text")
    : undefined;
  const text = textPart?.text ?? "";
  return (
    <div className={`hermes-message-user hermes-message-row hermes-optimistic-row ${kind === "steer" ? "hermes-steer-row" : ""}`} data-optimistic-kind={kind}>
      <div className={`hermes-bubble-user ${kind === "steer" ? "hermes-bubble-steer" : ""}`}>
        {kind === "steer" && <span className="hermes-steer-label">Steer</span>}
        {/* Attachments first — image sits ABOVE the text, matching settled rows. */}
        <AttachmentChips names={attachments} />
        {text && <span className="hermes-optimistic-text">{text}</span>}
      </div>
      {/* Optimistic rows use the send time (native allows omitting it entirely). */}
      {kind === "message" && entry?.ts && (
        <div className="hermes-msg-foot">
          <TimeSpan ts={entry.ts} />
        </div>
      )}
    </div>
  );
}

/** Assistant message: role header + headless parts with our custom cards,
 * native action footer. */
function AssistantMessageView({
  meta,
  isLastAssistant,
  editing,
  busy,
  editBusy,
  copied,
  onCopy,
  onFork,
  onRegenerate,
  onUndo,
}: {
  meta?: MessageMeta;
  isLastAssistant: boolean;
  editing: boolean;
  busy: boolean;
  editBusy: boolean;
  copied: boolean;
  onCopy: () => void;
  onFork: () => void;
  onRegenerate: () => void;
  onUndo: () => void;
}) {
  return (
    <MessagePrimitive.Root
      className="hermes-message-assistant hermes-message-row"
      data-raw-text={meta?.rawText ?? undefined}
    >
      <AssistantRoleHeader />
      <div className="hermes-message-body">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }: { text: string }) => <MarkdownText text={text} />,
            Reasoning: ReasoningPart,
            ToolGroup,
            tools: { Fallback: ToolPart },
          }}
        />
      </div>
      <MessageFoot
        busy={busy}
        copied={copied}
        editBusy={editBusy}
        editing={editing}
        isLastAssistant={isLastAssistant}
        isLastUser={false}
        meta={meta}
        onCancelEdit={() => { /* assistant messages are never edited inline */ }}
        onCopy={onCopy}
        onFork={onFork}
        onRegenerate={onRegenerate}
        onStartEdit={() => { /* assistant messages are never edited inline */ }}
        onSubmitEdit={() => { /* assistant messages are never edited inline */ }}
        onUndo={onUndo}
      />
    </MessagePrimitive.Root>
  );
}

/** User message: bubble (text + attachment chips) + native action footer;
 * inline edit replaces the bubble with a textarea while editing. */
function UserMessageView({
  attachments = [],
  meta,
  isLastUser,
  editing,
  busy,
  editBusy,
  copied,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onCopy,
  onFork,
}: {
  attachments?: string[];
  meta?: MessageMeta;
  isLastUser: boolean;
  editing: boolean;
  busy: boolean;
  editBusy: boolean;
  copied: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (text: string) => void;
  onCopy: () => void;
  onFork: () => void;
}) {
  return (
    <MessagePrimitive.Root
      className="hermes-message-user hermes-message-row"
      data-raw-text={meta?.rawText ?? undefined}
    >
      {editing ? (
        <>
          {/* Chips stay visible while editing (native keeps filesHtml above the textarea). */}
          <AttachmentChips names={attachments} />
          <InlineEditArea busy={editBusy} onCancel={onCancelEdit} onSubmit={onSubmitEdit} rawText={meta?.rawText ?? ""} />
        </>
      ) : (
        <>
          <div className="hermes-bubble-user">
            {/* Attachments first — image sits ABOVE the text, matching optimistic rows. */}
            <AttachmentChips names={attachments} />
            <MessagePrimitive.Parts
              components={{
                Text: ({ text }: { text: string }) => <span>{text}</span>,
              }}
            />
          </div>
          <MessageFoot
            busy={busy}
            copied={copied}
            editBusy={editBusy}
            editing={false}
            isLastAssistant={false}
            isLastUser={isLastUser}
            meta={meta}
            onCancelEdit={onCancelEdit}
            onCopy={onCopy}
            onFork={onFork}
            onRegenerate={() => { /* user messages are never regenerated inline */ }}
            onStartEdit={onStartEdit}
            onSubmitEdit={onSubmitEdit}
            onUndo={() => { /* user messages are never undone inline */ }}
          />
        </>
      )}
    </MessagePrimitive.Root>
  );
}

// --------------------------------------------------------------------------
// Island component: polls the API server session store and renders natively.
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Live streaming — WebUI stream mode (legacy-direct installs):
//
// The host runs the chat through its own stream bus (`/api/chat/stream`).
// `hermes:run-started` carries the WebUI stream id (hex); we subscribe to
// that SSE channel and map named events:
//   token          → append currentText
//   reasoning      → append reasoning
//   tool           → seal currentText, push tool segment
//   tool_complete  → mark matching segment done
//   done / stream_end / cancel / apperror → close + reconcile
//
// The live turn is rendered OUTSIDE the assistant-ui external store: settled
// messages go through the store as today, the in-flight turn is a dedicated
// component fed by `liveTurn` directly. Sealed segments are memoized so a
// token only re-renders the growing tail, never the tool cards or prior text.
// --------------------------------------------------------------------------

interface LiveToolState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Set to true when tool_complete fires — drives "done" status. */
  completed?: boolean;
  isError?: boolean;
}

interface LiveTurnState {
  /** Active reasoning buffer — folded into the turn's single grouped
   * Thinking control when it seals at a token/tool boundary. */
  reasoning: string;
  /** Monotonic stream-event counter marking where the ACTIVE reasoning
   * episode began. Carried onto the sealed segment as `pos` so the
   * Processing rail can render true chronological order even though
   * sealing fires later, at the boundary. */
  reasoningPos: number | null;
  /** Same tracking for the accumulating answer text (first token of the
   * current `currentText` run). */
  textPos: number | null;
  /** Ordered parts: "reasoning"/"text" segments and tool calls interleaved.
   * Each carries `sealedAt` (ms) and `pos` (stream position). Appends happen
   * at SEAL time, so consumers must sort by `pos` before displaying. */
  segments: Array<
    | { kind: "reasoning"; text: string; sealedAt: number; pos: number }
    | { kind: "text"; text: string; sealedAt: number; pos: number }
    | { kind: "tool"; tool: LiveToolState; sealedAt: number; pos: number }
  >;
  currentText: string;
}

/** Standalone markdown renderer for live segments (no part context needed). */
function LiveMarkdown({ text }: { text: string }) {
  const sid = sessionIdFromHost() ?? "";
  const processed = preprocessMediaTokens(text);
  return (
    <div className="hermes-md">
      <ReactMarkdown
        components={{
          // InlineOrCode: pass-through <code> so ReactMarkdown's own <pre> wraps it.
          // No nested <pre> risk. Copy header comes from the pre override.
          code: InlineOrCode,
          pre: CodePre,
          p: ({ children, ...rest }: React.ComponentPropsWithoutRef<"p">) => (
            <MediaAwareParagraph sessionId={sid} {...rest}>{children}</MediaAwareParagraph>
          ),
        }}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

const _LiveTextSegment = memo(
  function LiveTextSegmentInner({ text }: { text: string }) {
    if (!text.trim()) { return null; }
    return <LiveMarkdown text={text} />;
  },
  (prev, next) => prev.text === next.text,
);

const LiveToolSegment = memo(
  function LiveToolSegmentInner({ tool }: { tool: LiveToolState }) {
    const part = {
      type: "tool-call" as const,
      toolCallId: tool.toolCallId,
      toolName: tool.toolName,
      args: tool.args,
      argsText: stringify(tool.args),
      result: tool.completed ? "" : undefined,
      isError: tool.isError,
    } as unknown as ToolCallMessagePartProps;
    return <ToolPart {...part} />;
  },
  (prev, next) =>
    prev.tool.toolName === next.tool.toolName &&
    prev.tool.completed === next.tool.completed &&
    prev.tool.isError === next.tool.isError &&
    JSON.stringify(prev.tool.args) === JSON.stringify(next.tool.args),
);

/** Stable empty turn: lets the Processing rail mount the instant a run
 * starts (fallback "Processing" label) instead of waiting for the first
 * stream event to mint the live turn. Never mutated. */
const EMPTY_LIVE_TURN: LiveTurnState = {
  reasoning: "",
  reasoningPos: null,
  textPos: null,
  segments: [],
  currentText: "",
};

/**
 * The in-flight assistant turn, rendered outside the assistant-ui store.
 * Sealed segments are memoized; only the `currentText` tail re-renders on
 * each token event. Mid-run steer bubbles render in the outer flow between
 * the rail and the live answer (chronological: they were sent mid-process).
 *
 * ALL process activity — thinking episodes, interim prose, tool calls —
 * collapses under ONE compact <details> "Processing" rail (native WebUI
 * parity: process chrome folds away; the answer is the visible stream).
 * Thinking stays INLINE inside the rail, one compact card per episode with
 * its word-count meta (restored pre-grouping granularity). The rail's
 * summary label tracks the latest activity: freshest thinking snippet, the
 * newest streamed output, or a running tool's name — falling back to a
 * generic "Processing" before anything happens. The final answer
 * (currentText) renders OUTSIDE the rail as normal markdown.
 */
function processingRailLabel(turn: LiveTurnState): string {
  const liveThinking = turn.reasoning.trim();
  if (liveThinking) { return reasoningSnippet(liveThinking, 64); }
  const lastSealedText = [...turn.segments].reverse().find((s) => s.kind === "text");
  const latestText = turn.currentText.trim() || (lastSealedText ? lastSealedText.text.trim() : "");
  if (latestText) { return reasoningSnippet(latestText, 64); }
  const runningTool = [...turn.segments].reverse().find((s) => s.kind === "tool" && !s.tool.completed);
  if (runningTool && runningTool.kind === "tool") { return runningTool.tool.toolName; }
  return "Processing";
}

/** Render one sealed live segment for the Processing rail. */
function renderSeg(seg: LiveTurnState["segments"][number]): ReactNode {
  if (seg.kind === "reasoning") {
    return <ReasoningCard text={seg.text} />;
  }
  if (seg.kind === "text") {
    // Intermediate prose folded into the rail as muted rows (native
    // compact_worklog parity) — only the final answer is the message.
    return <div className="hermes-worklog-prose">{seg.text}</div>;
  }
  return <LiveToolSegment tool={seg.tool} />;
}

function LiveTurnView({ turn, steers }: { turn: LiveTurnState; steers: readonly OptimisticMessage[] }) {
  const railRows: ReactNode[] = [];
  const railEntries: Array<{ key: string; node: ReactNode; pos: number }> = [];
  const outerRows: ReactNode[] = [];
  // Steers are USER interjections, not process chrome — they stay outside
  // the collapsible rail (collapsing the rail must never hide the user's
  // own words). All of them render after the rail, just before the answer.
  const sortedSteers = [...steers].sort((a, b) => a.ts - b.ts);
  for (const o of sortedSteers) {
    outerRows.push(
      <OptimisticMessageView
        entry={o}
        key={o.id}
        message={{
          id: o.id,
          role: "user",
          content: [{ type: "text", text: o.text }] as unknown as ThreadMessageLike["content"] as never,
        }}
      />,
    );
  }
  turn.segments.forEach((seg, i) => {
    const key =
      seg.kind === "tool" ? `tool-${seg.tool.toolCallId}` : seg.kind === "text" ? `text-${i}` : `rsn-${i}`;
    // Sort key: where this segment BEGAN in the stream (sealing order ≠
    // stream order). Stable sort keeps equal-pos segments in arrival order.
    railEntries.push({ key, node: renderSeg(seg), pos: seg.pos });
  });
  // Chronological rail order.
  railEntries.sort((a, b) => a.pos - b.pos);
  for (const e of railEntries) { railRows.push(<React.Fragment key={e.key}>{e.node}</React.Fragment>); }
  // The still-growing thinking buffer streams as the rail's live card.
  if (turn.reasoning.trim()) {
    railRows.push(<ReasoningCard key="rsn-live" live text={turn.reasoning} />);
  }
  return (
    <div className="hermes-message-assistant hermes-message-row" data-live-turn>
      <AssistantRoleHeader />
      <div className="hermes-message-body">
        <details className="hermes-processing-rail">
          <summary>
            <svg aria-hidden className="hermes-processing-chevron" fill="none" viewBox="0 0 12 12">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            <span className="hermes-processing-label">{processingRailLabel(turn)}</span>
            <span className="hermes-processing-meta">
              {railRows.length} {railRows.length === 1 ? "step" : "steps"}
            </span>
          </summary>
          <div className="hermes-processing-body">{railRows}</div>
        </details>
        {outerRows}
        <LiveMarkdown text={turn.currentText} />
        <LiveTurnTimer />
      </div>
    </div>
  );
}

/** Native `.tool-call-group-duration` parity: ticks 1s while the live turn
 * is active so the operator sees elapsed run time next to the streaming
 * output (native _activityElapsedTimer updates every second). */
function LiveTurnTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="hermes-live-elapsed" data-live-elapsed>
      {elapsed}s
    </div>
  );
}

// --------------------------------------------------------------------------
// Empty state + suggestion provider interface.
//
// A brand-new session (no messages) renders the same fox avatar + prompt
// tiles the native empty chat screen shows. The tile list is pluggable:
// Vulpy Commerce can register a provider that returns (or rotates) the
// suggestions per session — the pane re-queries it every time the empty
// state mounts (keyed by session id), so rotation on session switch works
// out of the box. The provider is read lazily at render time, so script
// load order between this bundle and Vulpy feature scripts doesn't matter.
// --------------------------------------------------------------------------
export interface HermesSuggestion {
  /** Prompt sent via the host composer when the tile is clicked. */
  text: string;
  /** Optional inline SVG markup or emoji, rendered before the text. */
  icon?: string;
}

/**
 * Returns the suggestions for the current empty session. May return
 * null/undefined to fall back to the defaults, or a Promise for async
 * sources (e.g. config-fetched lists). Rotation (per session / per open)
 * is the provider's job — the pane just re-calls it.
 */
export type HermesSuggestionsProvider = () =>
  | readonly HermesSuggestion[]
  | null
  | undefined
  | Promise<readonly HermesSuggestion[] | null | undefined>;

/** Stable global slot — written by registerHermesSuggestionsProvider(). */
const SUGGESTIONS_PROVIDER_GLOBAL = "__hermesAuiSuggestionsProvider";

export function registerHermesSuggestionsProvider(
  provider: HermesSuggestionsProvider | null,
): void {
  try {
    (globalThis as Record<string, unknown>)[SUGGESTIONS_PROVIDER_GLOBAL] = provider;
  } catch {
    // non-window global (tests) — no cross-script hook needed
  }
}

function suggestionsProvider(): HermesSuggestionsProvider | null {
  try {
    const p = (globalThis as Record<string, unknown>)[SUGGESTIONS_PROVIDER_GLOBAL];
    return typeof p === "function" ? (p as HermesSuggestionsProvider) : null;
  } catch {
    return null;
  }
}

/** Mirrors the native empty-state tiles (same copy + icons as #emptyState). */
const DEFAULT_SUGGESTIONS: readonly HermesSuggestion[] = [
  {
    text: "What's in this workspace?",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  },
  {
    text: "What's on my schedule today?",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>`,
  },
  {
    text: "Help me plan a small project step by step.",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
  },
];

function hideEmptyStateSuggestions(): boolean {
  try {
    return (window as unknown as { _hideEmptyStateSuggestions?: boolean })
      ._hideEmptyStateSuggestions === true;
  } catch {
    return false;
  }
}

/** Mirrors the native empty-state tiles: fill the host composer + send(). */
function sendSuggestion(text: string): void {
  hostSendText(text);
}

/**
 * Empty chat screen for a fresh session: fox avatar, prompt, suggestion
 * tiles (provider-backed or defaults). Keyed by session id in the caller so
 * rotation providers re-run on every session switch.
 */
function EmptyStateView() {
  const [tiles, setTiles] = useState<readonly HermesSuggestion[] | null>(null);

  useEffect(() => {
    let alive = true;
    const provider = suggestionsProvider();
    const next = provider ? provider() : null;
    Promise.resolve(next).then((resolved) => {
      if (alive) { setTiles(resolved ?? null); }
    });
    return () => { alive = false; };
  }, []);

  const shown = tiles ?? DEFAULT_SUGGESTIONS;
  const cls = ["hermes-empty-state", hideEmptyStateSuggestions() ? "no-suggestions" : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
    >
      <div className="hermes-empty-logo">
        <img
          alt="Fox in the Box"
          decoding="async"
          height="80"
          src="/extensions/images/fox_avatar_cropped.jpg"
          width="80"
        />
      </div>
      <h2 className="hermes-empty-title">Think less. Start here.</h2>
      <p className="hermes-empty-subtitle">
        Ask the way you would a teammate: research, terminal work, files,
        schedules. The Fox runs it in the box — private, on your machine.
      </p>
      <div className="hermes-suggestion-grid">
        {shown.map((s) => (
          <button
            className="hermes-suggestion"
            key={s.text}
            onClick={() => sendSuggestion(s.text)}
            type="button"
          >
            {s.icon ? (
              <span
                aria-hidden="true"
                className="hermes-suggestion-icon"
                // Trusted markup: the provider is same-origin Vulpy code
                // (or this bundle's own defaults).
                // biome-ignore lint/security/noDangerouslySetInnerHtml: same-origin trusted SVG/emoji icons only
                dangerouslySetInnerHTML={{ __html: s.icon }}
              />
            ) : null}
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Extract plain text from a mapped user message (or null if not user text). */
function userMessageText(m: ThreadMessageLike): string | null {
  if (m.role !== "user") { return null; }
  if (!Array.isArray(m.content)) { return null; }
  const textParts = m.content.filter((p) => (p as { type?: string }).type === "text");
  const text = textParts.map((p) => String((p as { text?: unknown }).text ?? "")).join("");
  return text || null;
}

/**
 * Strip a partial in-flight assistant tail from the settled list while a live
 * turn is streaming: keep everything up to and including the last user row.
 * The live turn itself is rendered outside the store, so any server-written
 * partial row after the user message would otherwise duplicate it.
 */
function stripSettledTailWhileStreaming(settled: ThreadMessageLike[]): ThreadMessageLike[] {
  let lastUserIdx = -1;
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].role === "user") { lastUserIdx = i; }
  }
  return lastUserIdx >= 0 ? settled.slice(0, lastUserIdx + 1) : settled;
}

function pollIntervalMs(): number {
  return (
    (window as unknown as { __HERMES_AUI_POLL_MS?: number }).__HERMES_AUI_POLL_MS ?? 2000
  );
}

// Test-only observer: after every settled-poll reconcile, publish the
// resulting messages array (a `messages` reference that was NOT changed by
// the poll is published with unchanged:true — proves the settle poll skipped
// the re-render instead of allocating a fresh array). `seq` is a monotonic
// counter so tests can distinguish successive polls. Absent in production.
let pollResultSeq = 0;
function publishPollResult(messages: ThreadMessageLike[], unchanged: boolean): void {
  const w = window as unknown as {
    __hermesAuiPollResult?: { messages: ThreadMessageLike[]; unchanged: boolean; at: number; seq: number };
  };
  if (w.__hermesAuiPollResult) {
    w.__hermesAuiPollResult.messages = messages;
    w.__hermesAuiPollResult.unchanged = unchanged;
    w.__hermesAuiPollResult.at = Date.now();
    w.__hermesAuiPollResult.seq = ++pollResultSeq;
  }
}

function HermesThread() {
  const [sessionId, setSessionId] = useState<string | null>(() => sessionIdFromHost());
  // Mirror for the bus handlers (registered once, [] deps): read the CURRENT
  // session id without stale closures (steer stash on switch-away).
  const sessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const [liveTurn, setLiveTurn] = useState<LiveTurnState | null>(null);
  const liveTurnRef = useRef(liveTurn);
  useEffect(() => { liveTurnRef.current = liveTurn; }, [liveTurn]);
  // Staleness timer: after the last SSE delta, the backend may hold the stream
  // open for seconds while it finalizes (session save, hooks, title) before
  // emitting done. During that window nothing is streaming — show dots.
  const lastDeltaAtRef = useRef(0);
  const [staleRun, setStaleRun] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => {
      setStaleRun(runActiveRef.current && Date.now() - lastDeltaAtRef.current > 2500);
    }, 500);
    return () => window.clearInterval(t);
  }, []);
  /** WebUI stream id (hex) from hermes:run-started — drives /api/chat/stream. */
  const [webUiStreamId, setWebUiStreamId] = useState<string | null>(null);
  const [_refreshKey, setRefreshKey] = useState(0);

  // Optimistic UI (issue #142): user bubbles / steer bubbles shown instantly
  // from host bus events, before the settled poll catches up. Reconcile drops
  // them when the settled store returns the real row (text+ts window).
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  // Per-session steer cache: steers are NEVER persisted by the host, so a
  // session switch (setOptimistic([]) in session-changed) would otherwise
  // erase them forever. Stash current-session steers on switch-away and
  // restore them on switch-back (bounded — last STEER_CACHE_MAX sessions).
  const steerCacheRef = useRef<Map<string, OptimisticMessage[]>>(new Map());
  const STEER_CACHE_MAX = 8;
  const optimisticRef = useRef(optimistic);
  useEffect(() => { optimisticRef.current = optimistic; }, [optimistic]);
  // Run error surfaced from run.failed (native SSE) — read-only error card.
  const [runError, setRunError] = useState<string | null>(null);
  // True while the first settled tail fetch is in flight (skeleton rows).
  const [initialLoading, setInitialLoading] = useState(true);
  // Hard cap on the first-load skeleton (see the poll effect's deadline).
  const INITIAL_LOADING_MAX_MS = 6000;
  // True between run-started and the first delta (typing indicator).
  const [runActive, setRunActive] = useState(false);
  // Mirrors for the poll effect (which only depends on _refreshKey): keep the
  // latest run/stream state readable without stale closures.
  const runActiveRef = useRef(runActive);
  const webUiStreamIdRef = useRef(webUiStreamId);
  useEffect(() => { runActiveRef.current = runActive; }, [runActive]);
  useEffect(() => { webUiStreamIdRef.current = webUiStreamId; }, [webUiStreamId]);

  // Viewport ref for scroll anchoring during "load earlier" prepend.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Attachment names keyed by settled message id. Kept OUTSIDE the store
  // message objects — the assistant-ui converter expects CompleteAttachment[]
  // on user rows and would crash on our string[] names.
  const attachmentsByMsgIdRef = useRef<Map<string, string[]>>(new Map());
  // Native message parity (#173): per-message meta (timestamp / absolute raw
  // index / raw text) keyed by settled message id — same side-map pattern.
  const metaByMsgIdRef = useRef<Map<string, MessageMeta>>(new Map());
  // Inline edit state (#173): only one edit open at a time (native
  // row.dataset.editing guard); editBusy spans the truncate+send await.
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  // Copy feedback (check icon) keyed by message id, cleared after 1.5s.
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  // Set by the stream's terminal events; the settled poll consumes it in the
  // same batch as setMessages so liveTurn clears only once the final row is
  // actually visible (no blank-flash frame).
  const pendingClearLiveTurnRef = useRef(false);
  // Id of the locally-promoted final assistant row (paint-first finalize).
  // Set by finish(); removed by the settled poll once the canonical final row
  // is confirmed in the store, so the placeholder never lingers or duplicates.
  const liveFinalRowRef = useRef<string | null>(null);

  // ── Native message actions (#173) ────────────────────────────────────────
  const startEdit = (msgId: string) => {
    if (editingMsgId || editBusy) { return; }
    if (hostBusySnapshot() === true) { return; } // native S.busy guard
    setEditingMsgId(msgId);
  };

  const copyMessage = (msgId: string) => {
    const meta = metaByMsgIdRef.current.get(msgId);
    if (!meta) { return; }
    (navigator.clipboard?.writeText(meta.rawText.replace(/\n$/, "")) ?? Promise.reject())
      .then(() => {
        setCopiedMsgId(msgId);
        window.setTimeout(() => setCopiedMsgId((prev) => (prev === msgId ? null : prev)), 1500);
      })
      .catch(() => {/* silent — same policy as the code-block copy button */});
  };

  /** Truncate the session at keep_count, drop the truncated tail locally
   * (mirror native S.messages.slice), invalidate the delta cache and force an
   * immediate full-tail re-poll. Shared by edit + regenerate. */
  const truncateAndReset = async (sid: string, keepCount: number): Promise<void> => {
    const res = await postSessionAction(sid, "/api/session/truncate", { keep_count: keepCount });
    if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
    setMessages((prev) =>
      prev.filter((m) => {
        const mm = metaByMsgIdRef.current.get(String(m.id));
        return mm ? mm.rawIdx < keepCount : true;
      }),
    );
    spliceHostMessages(keepCount);
    tailCacheRef.current.delete(sid);
    setOptimistic([]);
    setLiveTurn(null);
    setRefreshKey((k) => k + 1);
  };

  const submitEdit = async (msgId: string, newText: string): Promise<void> => {
    const sid = sessionIdFromHost();
    const meta = metaByMsgIdRef.current.get(msgId);
    if (!(sid && meta ) || editBusy) { return; }
    if (hostBusySnapshot() === true) { return; }
    setEditBusy(true);
    try {
      await truncateAndReset(sid, meta.rawIdx);
      setEditingMsgId(null);
      hostSendText(newText);
    } catch (e) {
      setEditingMsgId(null);
      try {
        const toast = (globalThis as Record<string, unknown>).showToast;
        if (typeof toast === "function") { (toast as (m: string) => unknown)(`Edit failed: ${e instanceof Error ? e.message : String(e)}`); }
      } catch { /* no toast surface */ }
    } finally {
      setEditBusy(false);
    }
  };

  const regenerate = async (assistantMsgId: string): Promise<void> => {
    const sid = sessionIdFromHost();
    const meta = metaByMsgIdRef.current.get(assistantMsgId);
    if (!(sid && meta ) || editBusy) { return; }
    if (hostBusySnapshot() === true) { return; }
    // Find the preceding user text (native regenerateResponse scans backward).
    let userText = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      if (String(messages[i].id) === assistantMsgId) {
        for (let j = i - 1; j >= 0; j--) {
          const t = userMessageText(messages[j]);
          if (t) { userText = t; break; }
        }
        break;
      }
    }
    if (!userText) { return; }
    setEditBusy(true);
    try {
      await truncateAndReset(sid, meta.rawIdx);
      hostSendText(userText);
    } catch (e) {
      try {
        const toast = (globalThis as Record<string, unknown>).showToast;
        if (typeof toast === "function") { (toast as (m: string) => unknown)(`Regenerate failed: ${e instanceof Error ? e.message : String(e)}`); }
      } catch { /* no toast surface */ }
    } finally {
      setEditBusy(false);
    }
  };

  const undoLast = async (): Promise<void> => {
    const sid = sessionIdFromHost();
    if (!sid || editBusy) { return; }
    if (hostBusySnapshot() === true) { return; }
    setEditBusy(true);
    try {
      const res = await postSessionAction(sid, "/api/session/undo", {});
      if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
      // Drop the last user exchange locally (native cmdUndo refetches the
      // session — the full-tail re-poll below reconciles exactly).
      setMessages((prev) => {
        let lastUserIdx = -1;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].role === "user") { lastUserIdx = i; }
        }
        return lastUserIdx >= 0 ? prev.slice(0, lastUserIdx) : prev;
      });
      tailCacheRef.current.delete(sid);
      setOptimistic([]);
      setLiveTurn(null);
      setEditingMsgId(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      try {
        const toast = (globalThis as Record<string, unknown>).showToast;
        if (typeof toast === "function") { (toast as (m: string) => unknown)(`Undo failed: ${e instanceof Error ? e.message : String(e)}`); }
      } catch { /* no toast surface */ }
    } finally {
      setEditBusy(false);
    }
  };

  const forkFrom = async (msgId: string): Promise<void> => {
    const sid = sessionIdFromHost();
    const meta = metaByMsgIdRef.current.get(msgId);
    if (!(sid && meta ) || editBusy) { return; }
    if (hostBusySnapshot() === true) { return; }
    setEditBusy(true);
    try {
      const res = await postSessionAction(sid, "/api/session/branch", { keep_count: meta.rawIdx + 1 });
      if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
      const data: unknown = await res.json();
      const newSid = data && typeof data === "object" ? (data as { session_id?: unknown }).session_id : undefined;
      if (!newSid) { return; }
      // Switch the host session (native loadSession emits hermes:session-changed,
      // which the bus handler picks up); fall back to the localStorage key.
      const loadSession = (globalThis as Record<string, unknown>).loadSession;
      if (typeof loadSession === "function") {
        try {
          await (loadSession as (s: string) => Promise<unknown>)(String(newSid));
        } catch {
          try { window.localStorage.setItem("hermes-webui-session", String(newSid)); } catch { /* noop */ }
          setSessionId(String(newSid));
          setRefreshKey((k) => k + 1);
        }
      } else {
        try { window.localStorage.setItem("hermes-webui-session", String(newSid)); } catch { /* noop */ }
        setSessionId(String(newSid));
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      try {
        const toast = (globalThis as Record<string, unknown>).showToast;
        if (typeof toast === "function") { (toast as (m: string) => unknown)(`Fork failed: ${e instanceof Error ? e.message : String(e)}`); }
      } catch { /* no toast surface */ }
    } finally {
      setEditBusy(false);
    }
  };


  // Hermes Event Bus subscription (issue #142): the host emits lifecycle
  // events; this pane reacts instantly instead of waiting for the poll.
  // Unsubscribe on unmount. Bus may be absent in test harnesses — guard.
  useEffect(() => {
    let bus: HermesBus;
    try {
      bus = ensureHermesBus();
    } catch {
      return; // no bus — poll-only mode
    }
    const unsubs: Array<() => void> = [];
    const sub = (type: string, handler: (d: Record<string, unknown>) => void) => {
      try {
        unsubs.push(bus.subscribe(type, handler));
      } catch {
        // bus present but subscribe failed — skip this event type
      }
    };

    // Live-turn helpers (moved here from the per-stream EventSource effect,
    // 2026-08-17: the pane now consumes stream events over the bus instead of
    // opening a duplicate /api/chat/stream EventSource — see below).
    // streamSeq: monotonic counter over THIS turn's stream events; each
    // segment remembers where in the stream it began so the Processing rail
    // can sort segments chronologically (sealing order ≠ stream order).
    // Intentionally NEVER reset per run: monotonic across the whole pane
    // lifetime so done→settled→next-run ordering can never collide with a
    // previous turn's positions. Do NOT "fix" this to reset on run-start.
    let streamSeq = 0;
    const resetTurn = (): LiveTurnState => ({ reasoning: "", reasoningPos: null, textPos: null, segments: [], currentText: "" });

    /** Move the active reasoning buffer into a sealed reasoning segment. */
    const sealReasoning = (turn: LiveTurnState): LiveTurnState => {
      if (!turn.reasoning.trim()) { return turn; }
      return {
        ...turn,
        segments: [...turn.segments, { kind: "reasoning", text: turn.reasoning, sealedAt: Date.now(), pos: turn.reasoningPos ?? ++streamSeq }],
        reasoning: "",
        reasoningPos: null,
      };
    };

    /** Terminal: stop the live turn, keep it visible until the settled poll
     * confirms the final row (pendingClearLiveTurnRef consumed there). */
    const finish = (error?: string) => {
      lastDeltaAtRef.current = Date.now();
      if (error) { setRunError(error); } else { setRunError(null); }
      setRunActive(false);
      setWebUiStreamId(null);
      // Paint-first finalize: the user just watched the stream end. If the
      // settled API list happens to lag the committed final row (the backend
      // may not have flushed it when our poll fires), the live turn would be
      // dropped before the final message renders — a blank-flash until the
      // next poll/refresh. So on done we immediately promote the live turn's
      // accumulated content into the visible store as a settled assistant row.
      // The poll then removes this local placeholder precisely when it
      // confirms the canonical final row (finalRowVisible), so no duplicate.
      const turn = liveTurnRef.current;
      if (turn && (turn.currentText.trim() || turn.reasoning.trim() || turn.segments.length)) {
        const text = turn.currentText.trim();
        if (text) {
          const phId = `live-final-${Date.now()}`;
          const ph: ThreadMessageLike = {
            id: phId,
            role: "assistant",
            content: [{ type: "text", text }] as unknown as ThreadMessageLike["content"],
          };
          setMessages((prev) => {
            // If the settled store already shows a final assistant row (rare
            // race where done is late), don't add a duplicate on top of it.
            const last = prev.at(-1);
            if (last && last.role === "assistant") { return prev; }
            return [...prev, ph];
          });
          liveFinalRowRef.current = ph.id ?? null;
        }
      }
      pendingClearLiveTurnRef.current = true;
      setRefreshKey((k) => k + 1);
    };

    sub("hermes:message-sent", (d) => {
      const sid = String(d.sessionId ?? "");
      if (sid && sid !== sessionIdFromHost()) { return; }
      const text = String(d.text ?? "").trim();
      const ts = typeof d.ts === "number" ? d.ts : Date.now() / 1000;
      const optId = d.optimisticId ? String(d.optimisticId) : undefined;
      // Attachment names for the optimistic bubble: the host pushes the user
      // row into S.messages (with `attachments: names[]`) BEFORE emitting
      // hermes:message-sent — read the tail of that array. `S` is a global
      // lexical binding in the host's classic scripts (NOT on window); fall
      // back to window.S for test harnesses. pending_attachments is not
      // populated during send (it's only used in reconnect paths).
      let attachNames: string[] = [];
      try {
        const hostMessages = hostMessagesSnapshot();
        if (Array.isArray(hostMessages) && hostMessages.length > 0) {
          for (let i = hostMessages.length - 1; i >= 0; i--) {
            const m = hostMessages[i];
            if (m && m.role === "user") {
              attachNames = attachmentNames(m.attachments);
              break;
            }
          }
        }
      } catch { /* host object unavailable — text-only bubble */ }
      setOptimistic((prev) => {
        // Dedupe: same text within tolerance already optimistic (or reconciled).
        if (prev.some((o) => o.kind === "message" && o.text === text && Math.abs(o.ts - ts) < 2)) {
          return prev;
        }
        return [...prev, {
          id: optId ?? optimisticId("opt"),
          role: "user",
          text,
          status: "sending" as const,
          ts,
          kind: "message" as const,
          attachments: attachNames.length ? attachNames : undefined,
        }];
      });
      setRunError(null);
      // Dots appear IMMEDIATELY on send: the host emits message-sent BEFORE
      // /api/chat/start returns (run-started only arrives after that
      // round-trip). A failed start clears them via the host-busy backstop
      // in the poll (failure path never emits run-completed).
      setRunActive(true);
      // Push: own-send updates are instant — bump the reconciliation refetch.
      setRefreshKey((k) => k + 1);
    });

    sub("hermes:run-started", (d) => {
      const sid = String(d.sessionId ?? "");
      if (sid && sid !== sessionIdFromHost()) { return; }
      setOptimistic((prev) => prev.map((o) => (o.kind === "message" ? { ...o, status: "sent" as const } : o)));
      setRunActive(true);
      setRunError(null);
      // The host bus carries the WebUI stream id (hex) for /api/chat/stream.
      const streamId = d.streamId ? String(d.streamId) : "";
      if (streamId) { setWebUiStreamId((prev) => (prev === streamId ? prev : streamId)); }
      lastDeltaAtRef.current = Date.now();
      setRefreshKey((k) => k + 1);
    });

    sub("hermes:run-completed", (d) => {
      // Session-scoped like run-started: a delayed completion/Stop from a
      // DIFFERENT thread must not flip this thread's run state (cross-thread
      // interruption leak — issue #142 follow-up).
      const sid = String(d.sessionId ?? "");
      if (sid && sid !== sessionIdFromHost()) { return; }
      setRunActive(false);
      if (d.ok === false) {
        setRunError(String(d.error ?? d.message ?? "Run failed"));
      }
      setRefreshKey((k) => k + 1);
    });

    sub("hermes:stream-event", (d) => {
      // Live-turn events forwarded by the HOST from its own /api/chat/stream
      // EventSource (host patcher, 2026-08-17). The pane no longer opens a
      // duplicate EventSource — one same-origin socket during runs instead
      // of two (Chrome's 6-connection HTTP/1.1 pool was saturated by the
      // duplicate + persistent SSEs, stalling session-switch fetches and
      // hanging the whole UI).
      const sid = String(d.sessionId ?? "");
      if (sid && sid !== sessionIdFromHost()) { return; } // cross-session leak guard
      const esid = d.streamId ? String(d.streamId) : "";
      // Only render events for the ARMED stream (webUiStreamId). A stale
      // stream's events must never pollute the current live turn.
      if (webUiStreamIdRef.current) {
        if (esid && esid !== webUiStreamIdRef.current) { return; }
      } else if (esid) {
        // Mid-flight switch adoption: the session-changed handler tries
        // hostActiveStreamSnapshot(sid), but the host may emit the event
        // BEFORE it finishes re-attaching (S.busy/S.active_stream_id not set
        // yet) — the snapshot misses and the pane would sit unarmed, dropping
        // every stream event until the next poll tick re-arms (UI frozen
        // until the stream "updates"). The session guard above already
        // scoped this event to the CURRENT session, so the first event's
        // stream id is authoritative: adopt it synchronously.
        webUiStreamIdRef.current = esid;
        setWebUiStreamId(esid);
        setRunActive(true);
      }
      const type = String(d.eventType ?? "");
      const raw = String(d.data ?? "");
      lastDeltaAtRef.current = Date.now();

      if (type === "token") {
        try {
          const td = JSON.parse(raw) as Record<string, unknown>;
          const text = String(td.text ?? "");
          if (!text) { return; }
          setLiveTurn((prev) => {
            const turn = prev ?? resetTurn();
            // Token boundary ends the current thinking episode — seal it so
            // the next reasoning block gets its own card. The sealed episode
            // keeps the stream position where it BEGAN (chronology), and the
            // answer text remembers where its first token arrived.
            const sealed = sealReasoning(turn);
            return {
              ...sealed,
              textPos: sealed.textPos ?? ++streamSeq,
              currentText: sealed.currentText + text,
            };
          });
        } catch { /* malformed — skip */ }
        return;
      }
      if (type === "reasoning") {
        try {
          const rd = JSON.parse(raw) as Record<string, unknown>;
          const text = String(rd.text ?? "");
          if (!text) { return; }
          setLiveTurn((prev) => {
            const turn = prev ?? resetTurn();
            // Track where this thinking episode began in the stream.
            return { ...turn, reasoning: turn.reasoning + text, reasoningPos: turn.reasoningPos ?? ++streamSeq };
          });
        } catch { /* malformed — skip */ }
        return;
      }
      if (type === "tool") {
        try {
          const d2 = JSON.parse(raw) as Record<string, unknown>;
          const toolName = String(d2.name ?? d2.tool ?? "tool");
          if (!toolName || toolName === "clarify") { return; } // clarify handled natively by host UI
          const tid = d2.tid ? String(d2.tid) : undefined;
          const args = normalizeToolArgs(d2.args ?? d2.arguments);
          setLiveTurn((prev) => {
            const turn = prev ?? resetTurn();
            const now = Date.now();
            // Tool boundary also ends the current thinking episode. The
            // flushed text segment keeps the stream position where its first
            // token arrived (textPos), NOT the flush position.
            const sealed = sealReasoning(turn);
            const withText = sealed.currentText.trim()
              ? { ...sealed, segments: [...sealed.segments, { kind: "text" as const, text: sealed.currentText, sealedAt: now, pos: sealed.textPos ?? ++streamSeq }], currentText: "" }
              : sealed;
            // Synthetic stable id: toolName:occurrence when the host sends no tid.
            const toolCallId = tid ?? `${toolName}:${withText.segments.filter((s) => s.kind === "tool" && s.tool.toolName === toolName).length}`;
            const sealedSegs = [...withText.segments];
            sealedSegs.push({ kind: "tool", tool: { toolCallId, toolName, args }, sealedAt: now, pos: ++streamSeq });
            return { ...withText, segments: sealedSegs, textPos: null };
          });
        } catch { /* malformed — skip */ }
        return;
      }
      if (type === "tool_complete") {
        try {
          const d3 = JSON.parse(raw) as Record<string, unknown>;
          const toolName = String(d3.name ?? d3.tool ?? "tool");
          const isError = !!d3.is_error;
          const tid = d3.tid ? String(d3.tid) : undefined;
          // WebUI tool_complete carries NO result — settled poll will fill it.
          // We mark the segment done so the card shows "done" status immediately.
          setLiveTurn((prev) => {
            if (!prev) { return prev; }
            return {
              ...prev,
              segments: prev.segments.map((seg, i, arr) => {
                if (seg.kind !== "tool") { return seg; }
                const matches = tid
                  ? seg.tool.toolCallId === tid
                  : seg.tool.toolName === toolName;
                if (!matches || seg.tool.completed) { return seg; }
                // Prefer the most recent un-done tool with the same name.
                const laterMatching = arr.some(
                  (s, j) =>
                    j > i &&
                    s.kind === "tool" &&
                    s.tool.toolName === toolName &&
                    !s.tool.completed,
                );
                if (laterMatching) { return seg; }
                return { kind: "tool" as const, tool: { ...seg.tool, completed: true, isError }, sealedAt: seg.sealedAt, pos: seg.pos };
              }),
            };
          });
        } catch { /* malformed — skip */ }
        return;
      }
      if (type === "done" || type === "stream_end" || type === "cancel") {
        finish();
        return;
      }
      if (type === "apperror") {
        try {
          const ad = JSON.parse(raw) as Record<string, unknown>;
          finish(String(ad.error ?? ad.message ?? "Run failed"));
        } catch {
          finish("Run failed");
        }
      }
    });

    sub("hermes:session-changed", (d) => {
      const sid = String(d.sessionId ?? "");
      if (!sid) { return; }
      try { window.localStorage.setItem("hermes-webui-session", sid); } catch { /* noop */ }
      // Stash this session's steers before the optimistic wipe below — steers
      // are never persisted by the host, so without the cache a tab/session
      // switch erases them permanently.
      const prevSid = sessionIdRef.current;
      if (prevSid && prevSid !== sid) {
        const prevSteers = optimisticRef.current.filter((o) => o.kind === "steer");
        if (prevSteers.length > 0) { steerCacheRef.current.set(prevSid, prevSteers); }
        // Bound the cache — evict the least-recently-inserted session.
        while (steerCacheRef.current.size > STEER_CACHE_MAX) {
          const oldest = steerCacheRef.current.keys().next().value as string | undefined;
          if (oldest === undefined) { break; }
          steerCacheRef.current.delete(oldest);
        }
      }
      sessionIdRef.current = sid;
      setSessionId(sid);
      setOptimistic(steerCacheRef.current.get(sid) ?? []);
      setRunError(null);
      setEditingMsgId(null);
      setCopiedMsgId(null);
      // Re-discover active stream BEFORE clearing webUiStreamId: if the newly
      // selected session already has a stream in flight (user switched to a
      // running session), arm it immediately so bus stream-event tokens are
      // not silently dropped while the ref is null. Without this the pane
      // freezes until the 2 s poll re-arms (the stream-event guard checks the
      // ref synchronously and bails out when it finds null).
      const activeOnSwitch = hostActiveStreamSnapshot(sid);
      if (activeOnSwitch) {
        setRunActive(true);
        webUiStreamIdRef.current = activeOnSwitch.streamId;   // sync write — guard sees it immediately
        setWebUiStreamId(activeOnSwitch.streamId);
        lastDeltaAtRef.current = Date.now();
      } else {
        setRunActive(false);
        setLiveTurn(null);
        liveFinalRowRef.current = null;
        setWebUiStreamId(null);
      }
      setRefreshKey((k) => k + 1);
    });

    sub("hermes:steer-sent", (d) => {
      const sid = String(d.sessionId ?? "");
      if (sid && sid !== sessionIdFromHost()) { return; }
      const text = String(d.text ?? "").trim();
      if (!text) { return; }
      const ts = typeof d.ts === "number" ? d.ts : Date.now() / 1000;
      setOptimistic((prev) => {
        if (prev.some((o) => o.kind === "steer" && o.text === text && Math.abs(o.ts - ts) < 2)) {
          return prev;
        }
        const next: OptimisticMessage[] = [...prev, { id: optimisticId("steer"), role: "user", text, status: "sent", ts, kind: "steer" }];
        // Mirror live into the per-session cache so a switch-away does not
        // lose a steer that arrived after the last stash.
        const cur = sessionIdRef.current;
        if (cur) {
          steerCacheRef.current.set(cur, next.filter((o) => o.kind === "steer"));
        }
        return next;
      });
    });

    return () => {
      for (const unsub of unsubs) {
        try { unsub(); } catch { /* noop */ }
      }
    };
  }, []);

  // Raw rows loaded from the tail (the API counts tool rows separately from
  // the mapped store messages, so `messages.length` can never reach `total` —
  // comparing those would make the load-earlier button show forever).
  const [rawLoaded, setRawLoaded] = useState(0);
  const rawLoadedRef = useRef(rawLoaded);

  // Per-session tail cache (2026-08-17): switching sessions renders the
  // cached tail INSTANTLY, then the background poll reconciles. Before this,
  // every switch blanked the transcript and blocked on a full tail fetch —
  // which queued behind the browser's saturated connection pool (persistent
  // SSEs + the duplicate chat stream), making switches slow or hang entirely.
  interface TailCacheEntry {
    mapped: ThreadMessageLike[];
    rawCount: number;
    total: number | null;
    attachments: Record<string, string[]>;
    /** Native-message meta (ts / rawIdx / rawText) for instant switch-back. */
    meta: Record<string, MessageMeta>;
    lastId: number | null;  // max message id in this snapshot — for delta refreshes
    at: number;
  }
  const TAIL_CACHE_MAX = 12;
  const tailCacheRef = useRef(new Map<string, TailCacheEntry>());

  const hasMore = total === null
    ? rawLoaded >= tailLimit()
    : rawLoaded < total;

  // Load earlier pages: prepend older messages, anchor scroll.
  const loadEarlier = async () => {
    const sid = sessionIdFromHost();
    if (!sid || loadingEarlier) { return; }
    setLoadingEarlier(true);
    setEarlierError(null);

    // Capture scroll position before fetch for anchoring.
    const viewport = viewportRef.current;
    const scrollTopBefore = viewport ? viewport.scrollTop : 0;
    const scrollHeightBefore = viewport ? viewport.scrollHeight : 0;

    try {
      const offset = rawLoadedRef.current;
      const res = await fetch(sessionMessagesUrl(sid, { limit: pageLimit(), offset }), {
        headers: {
          Accept: "application/json",
          ...(csrfToken() ? { "X-Hermes-CSRF-Token": csrfToken() as string } : {}),
        },
        credentials: "include",
      });
      if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
      const data: unknown = await res.json();
      const { list, total } = normalizeSessionMessages(data);
      if (total !== undefined) {
        setTotal(total);
      }
      // Record meta (ts / absolute raw index / raw text) for this older page.
      indexRawWindow(list, { offset, total: total === undefined ? null : total }, metaByMsgIdRef.current);
      const olderMapped = mapApiMessages(list);
      if (olderMapped.length > 0) {
        // Older page consumed: raw rows loaded grows by the raw page size
        // (dedupe below may drop already-present rows — e.g. the tail poll
        // raced — so count by raw list length, not merged length).
        rawLoadedRef.current = offset + list.length;
        setRawLoaded(rawLoadedRef.current);
        setMessages((prev) => {
          // Dedupe: strip any ids already in prev.
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = olderMapped.filter((m) => !existingIds.has(m.id));
          const merged = [...fresh, ...prev];
          // After React applies this, anchor the scroll so the view doesn't jump.
          requestAnimationFrame(() => {
            if (viewport) {
              const delta = viewport.scrollHeight - scrollHeightBefore;
              viewport.scrollTop = scrollTopBefore + delta;
            }
          });
          return merged;
        });
      }
    } catch {
      setEarlierError("Failed to load earlier messages");
    } finally {
      setLoadingEarlier(false);
    }
  };

  // Session switch: reset pagination state when the session changes.
  const prevSessionIdRef = useRef<string | null>(sessionId);

  // Settled polling (reconciliation + session following).
  // Depends on _refreshKey: bus pushes (message-sent, run-completed,
  // session-changed) bump it to trigger an IMMEDIATE single refetch, keeping
  // the interval as the safety net for missed events / other tabs.
  useEffect(() => {
    // Intentional dependency: bus pushes (message-sent, run-completed,
    // session-changed) bump _refreshKey to re-run this effect → immediate
    // single refetch; the interval stays as the safety net. The key is read
    // into the poll URL as a cache-buster so the refetch is a fresh request.
    let cancelled = false;
    let timer = 0;

    const refreshSessionId = () => {
      const next = sessionIdFromHost();
      setSessionId((prev) => (prev === next ? prev : next));
    };

    const poll = async () => {
      refreshSessionId();
      const sid = sessionIdFromHost();
      if (!sid) {
        // No active host session (fresh page open / no conversation selected
        // yet): the thread is settled-empty — clear the skeleton so the
        // empty chat screen (fox avatar + tiles) shows, mirroring the native
        // #emptyState. The poll keeps running; the next tick after the host
        // creates or selects a session fetches it and the empty state hides.
        setInitialLoading(false);
        return;
      }

      // Detect session change: reset pagination immediately before fetching new session.
      if (sid !== prevSessionIdRef.current) {
        prevSessionIdRef.current = sid;
        attachmentsByMsgIdRef.current.clear();
        metaByMsgIdRef.current.clear();
        setEditingMsgId(null);
        setCopiedMsgId(null);
        rawLoadedRef.current = 0;
        setRawLoaded(0);
        setLoadingEarlier(false);
        setEarlierError(null);
        // Restore cached steers for the session we're switching TO (steers are
        // never persisted by the host; the session-changed handler stashed the
        // previous session's steers before this poll pass ran).
        setOptimistic(steerCacheRef.current.get(sid) ?? []);
        setRunError(null);
        // NOTE: do NOT reset runActive / liveTurn / webUiStreamId here. The
        // hermes:session-changed bus handler runs first and may already have
        // armed the stream for an active run on this session. Resetting run
        // state in the effect (which fires a render later) would cause a
        // brief flash through the empty-state screen before the bus-armed
        // state takes effect. The bus handler owns run-state on switch;
        // the effect only owns pagination + message state.
        // Instant switch (2026-08-17): render the cached tail immediately when
        // we've seen this session before; the fetch below reconciles in the
        // background. Without this, every switch blanked the transcript and
        // blocked on a tail fetch that queued behind the browser's saturated
        // connection pool — slow switches and full UI hangs.
        const cached = tailCacheRef.current.get(sid);
        if (cached) {
          for (const [k, v] of Object.entries(cached.attachments)) {
            attachmentsByMsgIdRef.current.set(k, v);
          }
          for (const [k, v] of Object.entries(cached.meta ?? {})) {
            metaByMsgIdRef.current.set(k, v);
          }
          rawLoadedRef.current = cached.rawCount;
          setRawLoaded(cached.rawCount);
          setMessages(cached.mapped);
          setTotal(cached.total);
          setInitialLoading(false);
        } else {
          // No cache: show skeleton immediately so the switch is visually
          // instant (blank white gap replaced by shimmer rows) while the
          // fetch lands. Without this setMessages([]) + initialLoading=false
          // leaves a blank pane until the first poll completes.
          setMessages([]);
          setTotal(null);
          setInitialLoading(true);
        }
      }

      try {
        // Delta refresh: if we have a warm cache for this session, pass
        // since_id so the server returns only newer messages (~0 bytes when
        // nothing is new). Falls back to full tail on cache miss.
        const cachedEntry = tailCacheRef.current.get(sid);
        const sinceId = cachedEntry?.lastId ?? null;
        const res = await fetch(sessionMessagesUrl(sid, { limit: tailLimit(), offset: 0, r: _refreshKey, sinceId }), {
          headers: {
            Accept: "application/json",
            ...(csrfToken() ? { "X-Hermes-CSRF-Token": csrfToken() as string } : {}),
          },
          credentials: "include",
        });
        if (cancelled) { return; }
        if (!res.ok) {
          // Completed but failed (e.g. a brand-new session the sidecar DB
          // can't see yet): clear the skeleton instead of shimmering forever.
          // An infinite skeleton is worse than a brief empty-state flash —
          // the interval keeps polling and a later success renders normally.
          setInitialLoading(false);
          return;
        }
        const data: unknown = await res.json();
        const { list, total: newTotal } = normalizeSessionMessages(data);
        if (newTotal !== undefined) {
          setTotal(newTotal);
        }
        // Tail fetch: raw rows returned = raw rows loaded so far (never less
        // than what load-earlier already accumulated — the interval poll
        // refetches the tail and must not clobber the pagination offset).
        rawLoadedRef.current = Math.max(rawLoadedRef.current, list.length);
        setRawLoaded(rawLoadedRef.current);
        const fetchedSid = sid;
        const freshMapped = mapApiMessages(list);
        // Record attachment names for the freshly fetched user rows (side map —
        // cannot live on the store message objects, see attachmentsByMsgIdRef).
        // The agent sidecar DB has NO attachments column — the host's own
        // S.messages (WebUI store, populated by loadSession) does. Enrich any
        // user row that the API reported without names by content-matching
        // against S.messages (normalized: strip the [Attached files: …] marker).
        const hostUserRows = (() => {
          try {
            const hm = hostMessagesSnapshot();
            return Array.isArray(hm) ? hm.filter((m) => m && m.role === "user") : [];
          } catch {
            return [];
          }
        })();
        for (const raw of list) {
          if (raw && typeof raw === "object" && (raw as { role?: string }).role === "user") {
            const rawId = (raw as { id?: string | number }).id;
            if (rawId === undefined || rawId === null) { continue; }
            let names = attachmentNames((raw as { attachments?: unknown }).attachments);
            if (names.length === 0) {
              const rawText = stripAttachedFilesMarker((raw as { content?: unknown }).content);
              for (const hm of hostUserRows) {
                if (stripAttachedFilesMarker(hm.content) === rawText) {
                  names = attachmentNames(hm.attachments);
                  break;
                }
              }
            }
            attachmentsByMsgIdRef.current.set(String(rawId), names);
          }
        }
        // Cache the fresh tail for instant switch-back (2026-08-17). Written
        // AFTER the attachment enrichment so the cached render restores names.
        // Meta is recorded here too (native-message parity) so switch-back
        // restores timestamps/raw indices for cached rows.
        indexRawWindow(list, { offset: 0, total: newTotal === undefined ? null : Number(newTotal) }, metaByMsgIdRef.current);
        const lastId = list.reduce((max, m) => {
          const id = (m as { id?: unknown }).id;
          const n = typeof id === "number" ? id : typeof id === "string" ? Number.parseInt(id, 10) : Number.NaN;
          return Number.isNaN(n) ? max : Math.max(max, n);
        }, -1);
        // Cache the ACCUMULATED window (older load-earlier pages + fresh
        // tail), not just this poll's tail slice — switch-back restores this
        // snapshot and must keep every page the operator already opened.
        setMessages((prev) => {
          if (prevSessionIdRef.current !== fetchedSid) { return prev; }
          const freshIds = new Set(freshMapped.map((m) => m.id));
          const merged = [...prev.filter((m) => !freshIds.has(m.id)), ...freshMapped];
          tailCacheRef.current.set(sid, {
            mapped: merged,
            // rawCount covers every raw row the accumulated window holds
            // (prev pages + this poll's rows); drives hasMore correctly.
            rawCount: Math.max(rawLoadedRef.current, list.length),
            total: newTotal === undefined ? null : Number(newTotal),
            attachments: Object.fromEntries(attachmentsByMsgIdRef.current),
            meta: Object.fromEntries(metaByMsgIdRef.current),
            lastId: lastId >= 0 ? lastId : null,
            at: Date.now(),
          });
          return prev;
        });
        if (tailCacheRef.current.size > TAIL_CACHE_MAX) {
          let oldestKey: string | null = null;
          let oldestAt = Number.POSITIVE_INFINITY;
          for (const [k, v] of tailCacheRef.current) {
            if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
          }
          if (oldestKey) { tailCacheRef.current.delete(oldestKey); }
        }
        // True when this poll's settled list already contains the run's final
        // assistant row (an assistant row after the last user row). Only then
        // is it safe to drop the live turn — otherwise we'd blank-flash.
        let finalRowVisible = false;
        for (let i = freshMapped.length - 1; i >= 0; i--) {
          if (freshMapped[i].role === "assistant") { finalRowVisible = true; break; }
          if (freshMapped[i].role === "user") { break; }
        }
        setMessages((prev) => {
          // Guard: discard if session switched again while the fetch was in flight.
          if (prevSessionIdRef.current !== fetchedSid) { return prev; }
          // Poll merge: keep older pages, update/append the tail.
          const freshIds = new Set(freshMapped.map((m) => m.id));
          const merged = [
            ...prev.filter((m) => !freshIds.has(m.id)),
            ...freshMapped,
          ];
          // Stable reference check + cheap delta-only content compare.
          // Only the FRESH rows (this poll's fetch result) are compared
          // against prev — never the whole history. The non-fresh prefix is
          // copied verbatim from prev (same object refs, `filter` preserves
          // identity), so if the fresh tail rows all match prev at the same
          // slot, the arrays are identical and we keep the prev reference
          // (skip a re-render). `sameContent` fingerprints a row's parts
          // cheaply — no per-message JSON.stringify of the full history.
          let same = false;
          if (merged.length === prev.length) {
            const prefix = prev.length - freshMapped.length;
            same = freshMapped.every((m, i) => {
              const n = prev[prefix + i];
              return n !== undefined && m.id === n.id && sameContent(m, n);
            });
          }
          // Consume the pending clear flag only when this poll confirms the
          // final settled row — whether or not the merge changed (`same` means
          // the store already shows it, so clearing is safe; skipping it here
          // would leave the live args-only card stuck on screen).
          if (pendingClearLiveTurnRef.current && finalRowVisible) {
            pendingClearLiveTurnRef.current = false;
            setLiveTurn(null);
          }
          // Drop the paint-first placeholder once the canonical final row is
          // confirmed in the settled store (no duplicate left behind).
          const promotedId = liveFinalRowRef.current;
          if (promotedId && finalRowVisible && freshMapped.some((m) => m.role === "assistant")) {
            liveFinalRowRef.current = null;
            const withoutPlaceholder = merged.filter((m) => m.id !== promotedId);
            if (same) {
              publishPollResult(prev, true);
              return prev;
            }
            publishPollResult(withoutPlaceholder, false);
            return withoutPlaceholder;
          }
          if (same) {
            // Test-only observer: unchanged poll → we keep the `prev`
            // reference (no new array, no re-render).
            publishPollResult(prev, true);
            return prev;
          }
          publishPollResult(merged, false);
          return merged;
        });
        // Reconcile optimistic bubbles against the settled store (issue #142):
        // drop a "message" bubble when the real user row arrives. Text match
        // OR attachment-name match is sufficient: optimistic entries are
        // session-scoped and short-lived (dropped on the next poll once the
        // row persists), so a fragile ts window is unnecessary — it only
        // caused duplicates when server and client clocks disagreed. File-only
        // sends persist their raw text (often empty) plus attachments, while
        // the bubble carried the host's display text — match on the files too.
        // Steer bubbles are never persisted by the host — keep them.
        // Host-busy backstop: message-sent optimistically shows dots, but the
        // pane's own stream terminal may never arrive (EventSource failed to
        // attach, connection died, bus run-completed missed/filtered). The
        // HOST's S.busy is authoritative for run end — it flips false exactly
        // when the host receives done (send button unlock). So if we still
        // think a run is active and the host says it isn't, end it: clear
        // runActive and arm the live-turn clear (finalRowVisible in the same
        // pass then drops the live card instead of leaving it stuck).
        if (runActiveRef.current) {
          const busy = hostBusySnapshot();
          if (busy === false) {
            setRunActive(false);
            pendingClearLiveTurnRef.current = true;
          }
        }
        // Host-state re-discovery: switching sessions resets runActive and
        // webUiStreamId (hermes:session-changed handler), but the host does
        // NOT re-emit hermes:run-started for an already-live stream when the
        // user switches back to (or into) the streaming session — it only
        // re-attaches internally (S.busy=true, S.session.active_stream_id).
        // If the host is busy streaming THIS session and we have no stream
        // armed, re-arm the typing dots + EventSource so an in-flight run is
        // visible again immediately (fix: dots lost on session switch).
        if (!(runActiveRef.current && webUiStreamIdRef.current)) {
          const active = hostActiveStreamSnapshot(sid);
          if (active) {
            setRunActive(true);
            setWebUiStreamId((prev) => (prev === active.streamId ? prev : active.streamId));
            lastDeltaAtRef.current = Date.now();
          }
        }
        setOptimistic((prev) => {
          if (prev.length === 0) { return prev; }
          const settledUsers = freshMapped.filter((m) => m.role === "user");
          const remaining = prev.filter((o) => {
            if (o.kind !== "message") { return true; }
            return !settledUsers.some((m) => {
              const t = userMessageText(m);
              if (t !== null && t === o.text) { return true; }
              const oAtt = o.attachments ?? [];
              const mAtt = attachmentsByMsgIdRef.current.get(String(m.id)) ?? [];
              return oAtt.length > 0 && oAtt.some((a) => mAtt.includes(a));
            });
          });
          if (remaining.length === prev.length) { return prev; }
          return remaining;
        });
        setInitialLoading(false);
      } catch {
        // transient — keep last snapshot, but never keep the FIRST-load
        // skeleton stuck on repeated errors: a hung/erroring tail fetch must
        // degrade to the empty state rather than shimmer forever.
        setInitialLoading(false);
      }
    };

    // Hard deadline: no fetch outcome (success, failure, or hang) may hold
    // the first-load skeleton longer than this. Safety net for requests that
    // never settle (proxy stalls, connection pool exhaustion).
    const loadingDeadline = window.setTimeout(() => {
      if (!cancelled) { setInitialLoading(false); }
    }, INITIAL_LOADING_MAX_MS);

    poll();
    timer = window.setInterval(poll, pollIntervalMs());
    return () => {
      cancelled = true;
      window.clearTimeout(loadingDeadline);
      window.clearInterval(timer);
    };
  }, [_refreshKey]);

  // WebUI stream subscription: REMOVED 2026-08-17 — live-turn events now
  // arrive over the Hermes Bus (hermes:stream-event, subscribed in the
  // main bus effect above). The pane no longer opens its own
  // /api/chat/stream EventSource: the HOST owns the single stream socket
  // and forwards raw events, so an active run holds one same-origin
  // connection instead of two (Chrome's 6-connection HTTP/1.1 pool was
  // saturated, stalling session-switch fetches and hanging the UI).

  const displayed = liveTurn
    ? stripSettledTailWhileStreaming(messages)
    : messages; // settled only — the live turn renders outside the store
  // Optimistic bubbles (issue #142): user sends append at the transcript tail
  // (before the live turn view, which sits outside the store). Steer bubbles
  // are labeled, never reconciled away, and render AFTER the live turn as
  // plain rows (see viewport below).
  const optimisticSends: ThreadMessageLike[] = optimistic
    .filter((o) => o.kind !== "steer")
    .map((o) => ({
      id: o.id,
      role: "user",
      content: [{ type: "text", text: o.text }] as unknown as ThreadMessageLike["content"] as never,
    }));
  const displayWithOptimistic: ThreadMessageLike[] =
    optimisticSends.length === 0 ? displayed : [...displayed, ...optimisticSends];
  const steerEntries = optimistic.filter((o) => o.kind === "steer");
  // Native message parity (#173): the LAST user / assistant messages drive
  // the edit / regenerate / undo buttons. Computed from the SETTLED store —
  // optimistic rows are transient and carry no raw metadata.
  let lastUserMsgId: string | null = null;
  let lastAssistantMsgId: string | null = null;
  for (const m of messages) {
    if (m.role === "user") { lastUserMsgId = String(m.id); }
    else if (m.role === "assistant") { lastAssistantMsgId = String(m.id); }
  }
  const hostBusy = hostBusySnapshot() === true;
  // Store-level isRunning: the live turn lives outside the store now, so the
  // runtime flag just tracks whether a run is active (drives viewport autoscroll).
  const isRunning = runActive || !!liveTurn;
  // Typing indicator: run active and nothing else is visibly progressing.
  // The live turn "is" the progress when text is streaming, reasoning is
  // growing, or a tool is still running — but a COMPLETED tool with an empty
  // currentText is a dead zone (the agent is thinking/queuing the next step),
  // so dots show until the next delta arrives. Same for the END of a run:
  // the backend holds the stream open for seconds after the final token
  // (session save, hooks, title) before emitting done — staleRun covers that
  // finalizing window so the UI never looks frozen next to a Stop button.
  const hasRunningTool = liveTurn?.segments.some((s) => s.kind === "tool" && !s.tool.completed) ?? false;
  const liveTurnIdle = liveTurn !== null && liveTurn.currentText.trim() === "" &&
    liveTurn.reasoning.trim() === "" && !hasRunningTool;
  const typingActive = runActive && (
    liveTurn === null ||
    liveTurnIdle ||
    (staleRun && !hasRunningTool)
  );

  const runtime = useExternalStoreRuntime({
    messages: displayWithOptimistic,
    isRunning,
    convertMessage: (message) => message,
    onNew: async () => {
      /* no composer — the WebUI input box sends */
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="hermes-thread-root">
        <ThreadPrimitive.Viewport
          autoScroll
          className="hermes-thread-viewport"
          ref={viewportRef}
        >
          {hasMore && (
            <div className="hermes-load-earlier">
              {earlierError ? (
                <button
                  className="hermes-load-earlier-btn hermes-load-earlier-error"
                  onClick={loadEarlier}
                  type="button"
                >
                  Failed to load earlier messages — retry
                </button>
              ) : (
                <button
                  className="hermes-load-earlier-btn"
                  disabled={loadingEarlier}
                  onClick={loadEarlier}
                  type="button"
                >
                  {loadingEarlier ? "Loading\u2026" : "Load earlier messages"}
                </button>
              )}
            </div>
          )}
          <ThreadPrimitive.Messages>
            {({ message }) => {
              const mid = String(message.id);
              if (mid.startsWith("opt-")) {
                const entry = optimistic.find((o) => o.id === mid);
                return <OptimisticMessageView entry={entry} message={message} />;
              }
              const meta = metaByMsgIdRef.current.get(mid);
              if (message.role === "user") {
                // Attachments come from the side map (mapApiMessages cannot
                // carry them on the store message — the AUI converter expects
                // CompleteAttachment[] there and would crash on string[]).
                const attachments = attachmentsByMsgIdRef.current.get(mid) ?? [];
                return (
                  <UserMessageView
                    attachments={attachments}
                    busy={hostBusy}
                    copied={copiedMsgId === mid}
                    editBusy={editBusy}
                    editing={editingMsgId === mid}
                    isLastUser={lastUserMsgId === mid}
                    meta={meta}
                    onCancelEdit={() => setEditingMsgId(null)}
                    onCopy={() => copyMessage(mid)}
                    onFork={() => forkFrom(mid)}
                    onStartEdit={() => startEdit(mid)}
                    onSubmitEdit={(text) => submitEdit(mid, text)}
                  />
                );
              }
              return (
                <AssistantMessageView
                  busy={hostBusy}
                  copied={copiedMsgId === mid}
                  editBusy={editBusy}
                  editing={editingMsgId === mid}
                  isLastAssistant={lastAssistantMsgId === mid}
                  meta={meta}
                  onCopy={() => copyMessage(mid)}
                  onFork={() => forkFrom(mid)}
                  onRegenerate={() => regenerate(mid)}
                  onUndo={undoLast}
                />
              );
            }}
          </ThreadPrimitive.Messages>
          {/* Live turn lives OUTSIDE the assistant-ui store — sealed segments
              are memoized so only the growing tail re-renders per token.
              Mid-run steer bubbles are interleaved INSIDE the live turn at
              the segment boundary where they were sent (steer ts vs segment
              sealedAt) instead of stacking at the bottom of the run. */}
          {(liveTurn ?? (runActive ? EMPTY_LIVE_TURN : null)) && (
            <LiveTurnView steers={steerEntries} turn={liveTurn ?? EMPTY_LIVE_TURN} />
          )}
          {/* No live turn yet (steer accepted before the stream opened, or
              between runs): fall back to tail placement so the steer is still
              visible. */}
          {!liveTurn && steerEntries.map((o) => (
            <OptimisticMessageView
              entry={o}
              key={o.id}
              message={{
                id: o.id,
                role: "user",
                content: [{ type: "text", text: o.text }] as unknown as ThreadMessageLike["content"] as never,
              }}
            />
          ))}
          {initialLoading && messages.length === 0 && optimistic.length === 0 && (
            <div aria-hidden="true" className="hermes-skeleton">
              {/* user bubble */}
              <div className="hermes-skeleton-msg hermes-skeleton-user">
                <div className="hermes-skeleton-row" style={{ width: "52%" }} />
              </div>
              {/* assistant reply — 3 lines of varying width */}
              <div className="hermes-skeleton-msg">
                <div className="hermes-skeleton-row" />
                <div className="hermes-skeleton-row" style={{ width: "82%" }} />
                <div className="hermes-skeleton-row" style={{ width: "55%" }} />
              </div>
              {/* second exchange */}
              <div className="hermes-skeleton-msg hermes-skeleton-user">
                <div className="hermes-skeleton-row" style={{ width: "38%" }} />
              </div>
              <div className="hermes-skeleton-msg">
                <div className="hermes-skeleton-row" />
                <div className="hermes-skeleton-row" style={{ width: "70%" }} />
              </div>
            </div>
          )}
          {/* Empty chat screen for a fresh session (AUI-native Empty primitive:
              renders only while the store thread has no messages). Gated on
              !initialLoading so the skeleton wins during the first tail fetch,
              and on !runActive so the typing indicator wins over the tiles.
              Keyed by session id so suggestion providers re-run on session
              switch (rotation hook). */}
          <ThreadPrimitive.Empty>
            {!(initialLoading || runActive ) && (
              <EmptyStateView key={sessionId ?? "no-session"} />
            )}
          </ThreadPrimitive.Empty>
          {typingActive && (
            <div className="hermes-message-assistant hermes-message-row">
              <output className="hermes-typing" >
                <span className="hermes-typing-dot" />
                <span className="hermes-typing-dot" />
                <span className="hermes-typing-dot" />
              </output>
            </div>
          )}
          {runError && (
            <div className="hermes-message-assistant hermes-message-row">
              <div className="hermes-error-card" role="alert">
                <div className="hermes-error-card-title">Run failed</div>
                <div className="hermes-error-card-body">{runError}</div>
                <div className="hermes-error-card-hint">Resend from the input box to retry.</div>
              </div>
            </div>
          )}
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

// --------------------------------------------------------------------------
// Mount / unmount
// --------------------------------------------------------------------------

interface MountState {
  root: ReturnType<typeof import("react-dom/client").createRoot>;
  pane: HTMLElement;
  layout: HTMLElement;
  messages: HTMLElement;
  originalParent: Node;
  originalNextSibling: Node | null;
  originalMessagesStyle: string;
  style: HTMLStyleElement;
}

let mounted: MountState | null = null;

/**
 * Runtime styling toggle — flips between the full Hermes theme and a minimal
 * skeleton layout so theme-vs-data issues can be isolated without rebuilding.
 *
 *   minimal: localStorage["hermes-aui-native"] === "1"  (or ?aui-native=1)
 *   hermes:  unset / "0" / any other value (default)
 */
function nativeStylingEnabled(targetDocument: Document): boolean {
  try {
    if (
      (targetDocument.defaultView?.localStorage.getItem("hermes-aui-native") ?? "") === "1"
    ) {
      return true;
    }
    if (
      targetDocument.defaultView?.location?.search.includes("aui-native=1")
    ) {
      return true;
    }
  } catch {
    // storage/query unavailable — default to Hermes styling
  }
  return false;
}

function themeCss(targetDocument: Document): string {
  return nativeStylingEnabled(targetDocument) ? HERMES_CSS_MINIMAL : HERMES_CSS;
}

export function mountAssistantUiRenderer(
  _unused: unknown = null,
  targetDocument: Document = document,
): boolean {
  if (mounted) { return true; }
  const messages = targetDocument.querySelector<HTMLElement>("#messages");
  const originalParent = messages?.parentNode;
  if (!(messages && originalParent)) { return false; }

  const originalNextSibling = messages.nextSibling;
  const originalMessagesStyle = messages.getAttribute("style") ?? "";

  // Pane-only mode: the assistant-ui pane replaces the host transcript. The
  // host data layer (loadSession → S.messages) keeps running; only its DOM
  // rebuild is skipped (renderMessages guard). Escape hatch:
  // localStorage["hermes-aui-split"] === "1" restores the side-by-side mirror.
  const paneOnly = (() => {
    try {
      return targetDocument.defaultView?.localStorage.getItem("hermes-aui-split") !== "1";
    } catch {
      return true;
    }
  })();

  const layout = targetDocument.createElement("div");
  layout.style.cssText = paneOnly
    ? "display:grid;grid-template-columns:minmax(0,1fr);flex:1 1 auto;min-height:0;width:100%;overflow:hidden;"
    : "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);flex:1 1 auto;min-height:0;width:100%;overflow:hidden;";
  layout.dataset.hermesAssistantUiLayout = "";

  const pane = targetDocument.createElement("section");
  pane.style.cssText =
    "min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;position:relative;";
  pane.dataset.hermesAssistantUiPane = "";
  pane.dataset.hermesStyling = nativeStylingEnabled(targetDocument) ? "native" : "hermes";
  pane.setAttribute("aria-label", "assistant-ui transcript");

  const style = targetDocument.createElement("style");
  style.id = "hermesAssistantUiStyles";
  style.textContent = themeCss(targetDocument);
  targetDocument.head.append(style);

  messages.style.cssText = paneOnly
    ? "display:none;"
    : "min-width:0;min-height:0;overflow:auto;border-right:1px solid var(--border);";
  originalParent.insertBefore(layout, messages);
  layout.append(messages, pane);

  if (paneOnly) {
    try {
      const w = targetDocument.defaultView as (Window & { __hermesAuiPaneOnly?: boolean }) | null;
      if (w) { w.__hermesAuiPaneOnly = true; }
    } catch {
      // non-window document (tests) — flag absent, harmless
    }
  }

  const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
  // React owns this child container; the debug toggle stays a sibling of it so
  // React's first commit (which clears the root container) can't wipe it.
  const reactRootEl = targetDocument.createElement("div");
  reactRootEl.style.cssText = "flex:1 1 auto;min-height:0;display:flex;flex-direction:column;";
  const root = createRoot(reactRootEl);
  mounted = { root, pane, layout, messages, originalParent, originalNextSibling, originalMessagesStyle, style };
  pane.append(reactRootEl);
  root.render(<HermesThread />);

  // Debug styling toggle — flips full Hermes theme / minimal skeleton live,
  // no reload. Deliberately vanilla DOM: React owns the root inside <section>,
  // this button is a sibling appended after render so the runtime never touches it.
  const toggle = targetDocument.createElement("button");
  toggle.type = "button";
  toggle.id = "hermesAuiStyleToggle";
  toggle.dataset.hermesDebugToggle = "";
  toggle.setAttribute("aria-label", "Toggle Hermes / minimal styling");
  toggle.title = "Toggle Hermes / minimal styling";
  toggle.textContent = nativeStylingEnabled(targetDocument) ? "AUI: minimal" : "AUI: hermes";
  toggle.style.cssText =
    "position:absolute;top:8px;right:8px;z-index:50;font-size:10px;line-height:1;" +
    "font-family:var(--font-mono,monospace);padding:3px 7px;border-radius:999px;" +
    "border:1px solid var(--border,rgba(0,0,0,.15));background:var(--surface,rgba(255,255,255,.8));" +
    "color:var(--muted,#666);cursor:pointer;opacity:.55;user-select:none;transition:opacity .12s;";
  toggle.addEventListener("mouseenter", () => { toggle.style.opacity = "1"; });
  toggle.addEventListener("mouseleave", () => { toggle.style.opacity = ".55"; });
  toggle.addEventListener("click", () => {
    const native = nativeStylingEnabled(targetDocument);
    try {
      targetDocument.defaultView?.localStorage.setItem("hermes-aui-native", native ? "0" : "1");
    } catch {
      // storage unavailable — still flip for this session via dataset fallback
    }
    const next = !native;
    style.textContent = next ? HERMES_CSS_MINIMAL : HERMES_CSS;
    pane.dataset.hermesStyling = next ? "native" : "hermes";
    toggle.textContent = next ? "AUI: minimal" : "AUI: hermes";
  });
  pane.append(toggle);
  return true;
}

export function unmountAssistantUiRenderer(): void {
  if (!mounted) { return; }
  const state = mounted;
  mounted = null;
  try {
    const w = state.pane.ownerDocument.defaultView as (Window & { __hermesAuiPaneOnly?: boolean }) | null;
    if (w) { w.__hermesAuiPaneOnly = false; }
  } catch {
    // non-window document — ignore
  }
  state.root.unmount();
  state.messages.setAttribute("style", state.originalMessagesStyle);
  if (state.originalNextSibling && state.originalNextSibling.parentNode === state.originalParent) {
    state.originalParent.insertBefore(state.messages, state.originalNextSibling);
  } else {
    state.originalParent.appendChild(state.messages);
  }
  state.layout.remove();
  state.style.remove();
}

export function isRendererMounted(): boolean {
  return mounted !== null;
}

export function cleanupRendererForTests(): void {
  unmountAssistantUiRenderer();
}

// --------------------------------------------------------------------------
// Auto-init: mount when the host DOM is ready. No seam needed — the thread
// reads the API server session store directly.
// --------------------------------------------------------------------------
function _autoInit(): void {
  if (isRendererMounted()) { return; }
  const attempt = () => {
    if (isRendererMounted()) { return; }
    const ok = mountAssistantUiRenderer();
    if (!ok) { setTimeout(attempt, 200); }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attempt, { once: true });
  } else {
    attempt();
  }
}

_autoInit();
