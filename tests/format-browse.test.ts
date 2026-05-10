import { describe, test, expect } from "vitest";
import { formatBrowse } from "../src/format-browse";
import type { BrowseResult } from "../src/client";

function makeResult(overrides: Partial<BrowseResult> = {}): BrowseResult {
  return {
    uri: "viking://resources",
    children: [],
    ...overrides,
  };
}

describe("formatBrowse", () => {
  test("formats empty list view", () => {
    const result = formatBrowse(makeResult(), "list");
    expect(result).toContain("URI: viking://resources");
    expect(result).toContain("No children.");
  });

  test("formats list view with children", () => {
    const r = makeResult({
      children: [
        { uri: "viking://resources/a", type: "file", abstract: "doc a" },
        { uri: "viking://resources/b", type: "directory" },
      ],
    });
    const result = formatBrowse(r, "list");
    expect(result).toContain("Children:");
    expect(result).toContain("- viking://resources/a (file)");
    expect(result).toContain("  doc a");
    expect(result).toContain("- viking://resources/b (directory)");
  });

  test("formats tree view", () => {
    const r = makeResult({
      children: [
        { uri: "viking://resources/a", type: "file" },
        { uri: "viking://resources/b", type: "directory" },
      ],
    });
    const result = formatBrowse(r, "tree");
    expect(result).toContain("├── viking://resources/a (file)");
    expect(result).toContain("└── viking://resources/b (directory)");
  });

  test("formats stat view", () => {
    const r = makeResult({
      uri: "viking://resources/file.md",
      children: [{ uri: "viking://resources/file.md", type: "file", abstract: "file.md" }],
    });
    const result = formatBrowse(r, "stat");
    expect(result).toContain("URI: viking://resources/file.md");
    expect(result).toContain("Type: file");
    expect(result).toContain("Name: file.md");
  });

  test("default view is list", () => {
    const r = makeResult({
      children: [{ uri: "viking://a", type: "file" }],
    });
    const result = formatBrowse(r);
    expect(result).toContain("Children:");
  });
});
