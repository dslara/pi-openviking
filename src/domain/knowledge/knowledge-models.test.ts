import { describe, it, expect } from "vitest";
import type { KnowledgeItem } from "./knowledge-item";
import type { ResourceItem } from "./resource-item";
import type { SkillItem } from "./skill-item";
import type { SearchResult } from "./search-result";
import type { Relation } from "./relation";

describe("KnowledgeItem", () => {
  it("accepts all fields", () => {
    const item: KnowledgeItem = {
      uri: "viking://docs/test",
      text: "test content",
      abstract: "short",
      overview: "medium",
      score: 0.95,
      category: "docs",
      level: 2,
      modTime: "2025-03-15T10:00:00Z",
    };
    expect(item.uri).toBe("viking://docs/test");
    expect(item.text).toBe("test content");
    expect(item.abstract).toBe("short");
    expect(item.overview).toBe("medium");
    expect(item.score).toBe(0.95);
    expect(item.category).toBe("docs");
    expect(item.level).toBe(2);
  });

  it("works with only required fields", () => {
    const item: KnowledgeItem = { uri: "u", text: "t" };
    expect(item.uri).toBe("u");
    expect(item.text).toBe("t");
  });
});

describe("ResourceItem", () => {
  it("accepts all fields", () => {
    const r: ResourceItem = { uri: "u", score: 0.8, abstract: "a" };
    expect(r.uri).toBe("u");
    expect(r.score).toBe(0.8);
  });

  it("works with only required fields", () => {
    const r: ResourceItem = { uri: "u" };
    expect(r.uri).toBe("u");
  });
});

describe("SkillItem", () => {
  it("accepts all fields", () => {
    const s: SkillItem = { uri: "u", score: 0.9, abstract: "a" };
    expect(s.uri).toBe("u");
    expect(s.score).toBe(0.9);
  });
});

describe("SearchResult", () => {
  it("has separate arrays for memories/resources/skills", () => {
    const result: SearchResult = {
      memories: [{ uri: "m1", text: "mem" }],
      resources: [{ uri: "r1" }],
      skills: [{ uri: "s1" }],
      total: 3,
      queryPlan: "mode=deep",
    };
    expect(result.memories).toHaveLength(1);
    expect(result.resources).toHaveLength(1);
    expect(result.skills).toHaveLength(1);
    expect(result.total).toBe(3);
    expect(result.queryPlan).toBe("mode=deep");
  });

  it("works with only required fields", () => {
    const result: SearchResult = {
      memories: [],
      resources: [],
      skills: [],
      total: 0,
    };
    expect(result.total).toBe(0);
  });
});

describe("Relation", () => {
  it("accepts all fields", () => {
    const rel: Relation = { uri: "viking://related", reason: "references" };
    expect(rel.uri).toBe("viking://related");
    expect(rel.reason).toBe("references");
  });

  it("works with only required fields", () => {
    const rel: Relation = { uri: "u" };
    expect(rel.reason).toBeUndefined();
  });
});
