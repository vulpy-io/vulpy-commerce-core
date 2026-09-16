/**
 * Registry shape test — the single source of truth for frontend tools.
 *
 * The registry is consumed at BUILD time by the message-renderer island
 * (frontendToolByName) and at REQUEST time by the patched gateway_chat.py
 * (system-prompt injection). A broken registry must fail CI here, not at
 * runtime in either consumer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REGISTRY_PATH = resolve(import.meta.dirname, "../frontend-tools/registry.json");
const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as {
  version: number;
  tools: Array<{
    name: string;
    description: string;
    schema: {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    renderer: string;
  }>;
};

describe("frontend-tools registry", () => {
  it("has a version and at least one tool", () => {
    expect(registry.version).toBe(1);
    expect(Array.isArray(registry.tools)).toBe(true);
    expect(registry.tools.length).toBeGreaterThan(0);
  });

  it("every tool has name, description, schema and renderer", () => {
    for (const tool of registry.tools) {
      expect(typeof tool.name, `tool ${tool.name}`).toBe("string");
      expect(tool.name.length, `tool ${tool.name} name length`).toBeGreaterThan(0);
      expect(typeof tool.description, `tool ${tool.name} description`).toBe("string");
      expect(tool.description.length, `tool ${tool.name} description length`).toBeGreaterThan(0);
      expect(tool.schema, `tool ${tool.name} schema`).toBeTruthy();
      expect(tool.schema.type, `tool ${tool.name} schema.type`).toBe("object");
      expect(typeof tool.renderer, `tool ${tool.name} renderer`).toBe("string");
      expect(tool.renderer.length, `tool ${tool.name} renderer length`).toBeGreaterThan(0);
    }
  });

  it("tool names are unique", () => {
    const names = registry.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("create_chart schema is sane for the pane renderer", () => {
    const chart = registry.tools.find((t) => t.name === "create_chart");
    expect(chart).toBeTruthy();
    const schema = chart!.schema;
    const props = schema.properties ?? {};

    // Required fields exist and are declared required.
    expect(schema.required).toContain("chart_type");
    expect(schema.required).toContain("title");
    expect(schema.required).toContain("data");

    // chart_type is an enum of exactly the four renderer-supported types.
    const chartType = props.chart_type as { type?: string; enum?: string[] };
    expect(chartType.type).toBe("string");
    expect(chartType.enum).toEqual(["line", "bar", "pie", "area"]);

    // data items carry label + value with a numeric value.
    const data = props.data as { type?: string; items?: { properties?: Record<string, { type?: string }>; required?: string[] } };
    expect(data.type).toBe("array");
    expect(data.items?.properties?.label?.type).toBe("string");
    expect(data.items?.properties?.value?.type).toBe("number");
    expect(data.items?.required).toContain("label");
    expect(data.items?.required).toContain("value");

    // options are optional and typed.
    const options = props.options as { properties?: Record<string, { type?: string }> };
    expect(options.properties?.color?.type).toBe("string");
    expect(options.properties?.x_label?.type).toBe("string");
    expect(options.properties?.y_label?.type).toBe("string");

    // The pane renderer key matches the shipped renderer.
    expect(chart!.renderer).toBe("chart");
  });

  it("render_preview schema accepts only session-scoped file-on-disk media", () => {
    const preview = registry.tools.find((t) => t.name === "render_preview");
    expect(preview?.renderer).toBe("preview");
    const props = preview!.schema.properties ?? {};
    expect(preview!.schema.required).toEqual(["type", "path"]);
    expect((props.type as { enum?: string[] }).enum).toEqual(["html", "svg", "image", "audio", "video"]);
    expect((props.path as { type?: string }).type).toBe("string");
    expect((props.title as { maxLength?: number }).maxLength).toBe(120);
    expect(preview!.description).toContain("never put file content");
  });
});
