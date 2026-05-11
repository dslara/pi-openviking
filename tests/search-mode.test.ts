import { describe, test, expect } from "vitest";
import { resolveSearchMode } from "../src/shared/search-mode";

describe("resolveSearchMode", () => {
  test("explicit fast returns fast", () => {
    expect(resolveSearchMode("fast", "hello", "sess-1")).toBe("fast");
  });

  test("explicit deep returns deep", () => {
    expect(resolveSearchMode("deep", "hello", undefined)).toBe("deep");
  });

  test("auto with session and simple query returns fast", () => {
    expect(resolveSearchMode("auto", "hello", "sess-1")).toBe("fast");
  });

  test("auto with session and long query returns deep", () => {
    const query = "a".repeat(80);
    expect(resolveSearchMode("auto", query, "sess-1")).toBe("deep");
  });

  test("auto without session and simple query returns fast", () => {
    expect(resolveSearchMode("auto", "hello", undefined)).toBe("fast");
  });

  test("auto without session and long query returns deep", () => {
    const query = "a".repeat(80);
    expect(resolveSearchMode("auto", query, undefined)).toBe("deep");
  });

  test("auto without session and query with question mark returns deep", () => {
    expect(resolveSearchMode("auto", "What is this?", undefined)).toBe("deep");
  });

  test("auto without session and wordy query returns deep", () => {
    expect(resolveSearchMode("auto", "one two three four five six seven eight", undefined)).toBe("deep");
  });

  test("auto without session and seven-word query returns fast", () => {
    expect(resolveSearchMode("auto", "one two three four five six seven", undefined)).toBe("fast");
  });

  test("auto without session and 79-char query returns fast", () => {
    expect(resolveSearchMode("auto", "a".repeat(79), undefined)).toBe("fast");
  });
});
