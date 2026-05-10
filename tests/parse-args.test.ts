import { describe, test, expect } from "vitest";
import { parseArgs } from "../src/parse-args";

describe("parseArgs", () => {
  test("returns empty for empty string", () => {
    const result = parseArgs("");
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual([]);
  });

  test("parses positional args only", () => {
    const result = parseArgs("hello world");
    expect(result.positional).toEqual(["hello", "world"]);
    expect(result.flags).toEqual({});
  });

  test("parses flags with values", () => {
    const result = parseArgs("--limit 10 --uri viking://test");
    expect(result.flags).toEqual({ limit: "10", uri: "viking://test" });
    expect(result.positional).toEqual([]);
  });

  test("parses mixed boolean flags and positional", () => {
    const booleans = new Set(["deep"]);
    const result = parseArgs("--deep how does auth work", booleans);
    expect(result.flags).toEqual({ deep: undefined });
    expect(result.positional).toEqual(["how", "does", "auth", "work"]);
  });

  test("parses flag with value before positional", () => {
    const result = parseArgs("--limit 20 search query");
    expect(result.flags).toEqual({ limit: "20" });
    expect(result.positional).toEqual(["search", "query"]);
  });

  test("ignores unknown flags", () => {
    const result = parseArgs("--unknown-flag value hello");
    expect(result.flags).toEqual({ "unknown-flag": "value" });
    expect(result.positional).toEqual(["hello"]);
  });

  test("handles boolean flag at end without value", () => {
    const booleans = new Set(["deep"]);
    const result = parseArgs("hello --deep", booleans);
    expect(result.flags).toEqual({ deep: undefined });
    expect(result.positional).toEqual(["hello"]);
  });

  test("handles multiple valueless boolean flags", () => {
    const booleans = new Set(["deep", "fast"]);
    const result = parseArgs("--deep --fast", booleans);
    expect(result.flags).toEqual({ deep: undefined, fast: undefined });
    expect(result.positional).toEqual([]);
  });

  test("handles -- alone", () => {
    const result = parseArgs("--");
    expect(result.flags).toEqual({ "": undefined });
    expect(result.positional).toEqual([]);
  });

  test("trims whitespace", () => {
    const result = parseArgs("  --limit 10  query  ");
    expect(result.flags).toEqual({ limit: "10" });
    expect(result.positional).toEqual(["query"]);
  });

  test("boolean flag does not consume next token", () => {
    const booleans = new Set(["deep", "fast"]);
    const result = parseArgs("--deep --limit 10 query", booleans);
    expect(result.flags).toEqual({ deep: undefined, limit: "10" });
    expect(result.positional).toEqual(["query"]);
  });
});
