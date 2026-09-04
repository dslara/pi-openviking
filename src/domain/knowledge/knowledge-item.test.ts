import { describe, it, expect } from "vitest";
import type { KnowledgeItem } from "./knowledge-item";

describe("KnowledgeItem", () => {
  it("includes contextType and matchReason as optional fields", () => {
    const item: KnowledgeItem = {
      uri: "viking://mem/1",
      text: "some memory",
      contextType: "memory",
      matchReason: "semantic match",
    };
    expect(item.contextType).toBe("memory");
    expect(item.matchReason).toBe("semantic match");
  });

  it("allows contextType to be resource or skill", () => {
    const resource: KnowledgeItem = { uri: "viking://res/1", text: "res", contextType: "resource" };
    const skill: KnowledgeItem = { uri: "viking://skill/1", text: "skill", contextType: "skill" };
    expect(resource.contextType).toBe("resource");
    expect(skill.contextType).toBe("skill");
  });

  it("omits contextType and matchReason when not provided", () => {
    const item: KnowledgeItem = { uri: "viking://mem/1", text: "plain" };
    expect(item.contextType).toBeUndefined();
    expect(item.matchReason).toBeUndefined();
  });

  it("works with existing fields unchanged", () => {
    const item: KnowledgeItem = {
      uri: "viking://mem/1",
      text: "text",
      abstract: "abstract",
      overview: "overview",
      score: 0.95,
      category: "docs",
      level: 2,
      modTime: "2026-01-01T00:00:00Z",
    };
    expect(item.score).toBe(0.95);
    expect(item.category).toBe("docs");
  });
});
