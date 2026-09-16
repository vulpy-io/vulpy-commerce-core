/** Regression contract for onboarding copy and the typed integration boundary. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");
const provisioner = readFileSync(join(root, "extensions/hermes-webui/scripts/provision-missions.py"), "utf8");
const commerce = readFileSync(join(root, "extensions/hermes-plugins/vulpy-commerce/__init__.py"), "utf8");
const mission = (n: number) =>
  readFileSync(join(root, `.hermes/skills/vulpy-store-missions/vulpy-mission-${n}-${["hello", "voice", "mood", "design", "catalog", "build"][n]}/SKILL.md`), "utf8");

describe("onboarding lessons and integration contracts", () => {
  it("keeps native MEDIA tokens in fresh mission provisioning", () => {
    expect(provisioner).toContain("MEDIA:/extensions/images/fox_avatar_cropped.jpg");
  });

  it.each([0, 3, 4, 5])("explains the empty-shell template and decision gates in Mission %s", (n) => {
    const copy = mission(n);
    expect(copy).toMatch(/empty shell/i);
    expect(copy).toMatch(/working plumbing|working wiring|plumbing and wiring/i);
    expect(copy).toMatch(/ready to move/i);
    expect(copy).toMatch(/needs this decision/i);
    expect(copy).toMatch(/usable,? (?:and )?can keep iterating/i);
  });

  it("marks the typed integration executor as planning-only instead of implying execution", () => {
    expect(commerce).toMatch(/planning-only/i);
    expect(commerce).toMatch(/no executor|executor gap/i);
  });

  it("requires explicit response language and positive provenance on mutations", () => {
    expect(commerce).toContain("response_language");
    expect(commerce).toContain("provenance");
    expect(commerce).toContain("tenant_id");
    expect(commerce).toContain("source");
  });

  it("exposes actionable operator status codes and rendered verification", () => {
    expect(commerce).toContain("route_unavailable");
    expect(commerce).toContain("renderer_unavailable");
    expect(commerce).toContain("provider_unavailable");
    expect(commerce).toContain("bridge_unavailable");
    expect(commerce).toContain("rendered_verification");
    expect(commerce).toContain("stale_content");
  });
});
