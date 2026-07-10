import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("ue-widget-developer skill documentation", () => {
  it("keeps Figma review as the design gate and forbids generic brainstorming detours", () => {
    const skillRoot = resolveSkillRoot();
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const workflow = readFileSync(resolve(skillRoot, "references/tool-workflow.md"), "utf8");
    const combined = `${skill}\n${workflow}`;

    expect(combined).toContain("Figma node review is the design gate");
    expect(combined).toContain("Do not route MistyPlanet Widget Blueprint work through generic brainstorming");
    expect(combined).toContain("Do not write a superpowers spec or implementation plan for routine widget creation");
    expect(combined).toContain("Use Figma frames and semantic layer names as the source protocol");
  });

  it("requires a visual originality gate so widget drafts do not reuse stale templates", () => {
    const skillRoot = resolveSkillRoot();
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const workflow = readFileSync(resolve(skillRoot, "references/tool-workflow.md"), "utf8");
    const rubric = readFileSync(resolve(skillRoot, "references/visual-design-rubric.md"), "utf8");
    const combined = `${skill}\n${workflow}\n${rubric}`;

    expect(combined).toContain("visual originality gate");
    expect(combined).toContain("template_rejection");
    expect(combined).toContain("Examples in this skill are protocol examples, not visual templates");
    expect(combined).toContain("centered fixed settings rectangle");
    expect(combined).toContain("same as the last one with different labels");
  });

  it("requires generic project UI context before visual design when no written style guide exists", () => {
    const skillRoot = resolveSkillRoot();
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const workflow = readFileSync(resolve(skillRoot, "references/tool-workflow.md"), "utf8");
    const context = readFileSync(resolve(skillRoot, "references/project-ui-context.md"), "utf8");
    const rubric = readFileSync(resolve(skillRoot, "references/visual-design-rubric.md"), "utf8");
    const combined = `${skill}\n${workflow}\n${context}\n${rubric}`;

    expect(combined).toContain("Use this before designing or redesigning UI in any project");
    expect(combined).toContain("Universal Search Order");
    expect(combined).toContain("If no written guidance exists, sample existing UI implementation and assets");
    expect(combined).toContain("project_sources");
    expect(combined).toContain("style_guide_status");
    expect(combined).toContain("observed_language");
    expect(combined).toContain("design-language brief");
    expect(combined).toContain("design_language_fit");
    expect(combined).toContain("Do not proceed with visual design if `project_sources` is empty");
    expect(combined).toContain("Current Repository Hints");
  });
});

function resolveSkillRoot(): string {
  const candidates = [
    resolve("../../ue-widget-developer"),
    resolve("../skills/ue-widget-developer")
  ];
  const found = candidates.find((candidate) => existsSync(resolve(candidate, "SKILL.md")));
  if (!found) {
    throw new Error(`Could not find ue-widget-developer skill in: ${candidates.join(", ")}`);
  }
  return found;
}
