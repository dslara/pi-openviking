import { describe, it, expect } from "vitest";
import { toLinkResult, toRelations } from "./relation-mapper";
import { Uri } from "../../domain/common/uri";

describe("toLinkResult", () => {
  it("maps link response with source and targets", () => {
    const raw = { from_uri: "viking://a", to_uris: ["viking://b", "viking://c"], reason: "related" };
    const result = toLinkResult(raw, new Uri("viking://a"), [new Uri("viking://b"), new Uri("viking://c")], "related");
    expect(result.source.value).toBe("viking://a");
    expect(result.targets).toHaveLength(2);
    expect(result.targets[0].value).toBe("viking://b");
    expect(result.reason).toBe("related");
  });

  it("handles single target wrapped in array", () => {
    const raw = { from_uri: "viking://a", to_uris: ["viking://b"] };
    const result = toLinkResult(raw, new Uri("viking://a"), [new Uri("viking://b")]);
    expect(result.targets).toHaveLength(1);
  });

  it("uses provided source/targets over raw values", () => {
    const raw = { from_uri: "viking://raw-from", to_uris: ["viking://raw-to"] };
    const result = toLinkResult(raw, new Uri("viking://provided"), [new Uri("viking://provided-to")]);
    expect(result.source.value).toBe("viking://provided");
    expect(result.targets[0].value).toBe("viking://provided-to");
  });

  it("handles null/undefined raw gracefully", () => {
    const result = toLinkResult(null, new Uri("viking://s"), [new Uri("viking://t")]);
    expect(result.source.value).toBe("viking://s");
    expect(result.targets).toHaveLength(1);
  });
});

describe("toRelations", () => {
  it("maps array of relations from OV graph response", () => {
    const raw = {
      relations: [
        { uri: "viking://b", reason: "contains" },
        { uri: "viking://c", reason: "references" },
      ],
    };
    const result = toRelations(raw);
    expect(result).toHaveLength(2);
    expect(result[0].uri).toBe("viking://b");
    expect(result[0].reason).toBe("contains");
    expect(result[1].reason).toBe("references");
  });

  it("handles direct array response", () => {
    const raw = [
      { uri: "viking://b" },
      { uri: "viking://c", reason: "related" },
    ];
    const result = toRelations(raw);
    expect(result).toHaveLength(2);
    expect(result[0].uri).toBe("viking://b");
    expect(result[0].reason).toBeUndefined();
  });

  it("handles empty relations", () => {
    expect(toRelations({ relations: [] })).toHaveLength(0);
    expect(toRelations([])).toHaveLength(0);
  });

  it("handles null/undefined", () => {
    expect(toRelations(null)).toHaveLength(0);
    expect(toRelations(undefined)).toHaveLength(0);
  });

  it("handles items with missing reason", () => {
    const raw = { relations: [{ uri: "viking://b" }] };
    const result = toRelations(raw);
    expect(result[0].reason).toBeUndefined();
  });
});
