import { describe, it, expect } from "vitest";
import type { OVResourceImportResponse } from "./ov-resource";

describe("OVResourceImportResponse", () => {
  it("creates success response", () => {
    const r: OVResourceImportResponse = {
      status: "completed",
      root_uri: "viking://resources/",
      source_path: "https://example.com/doc.md",
    };
    expect(r.status).toBe("completed");
    expect(r.root_uri).toBe("viking://resources/");
    expect(r.source_path).toBe("https://example.com/doc.md");
    expect(r.errors).toBeUndefined();
  });

  it("includes errors on failure", () => {
    const r: OVResourceImportResponse = {
      status: "failed",
      root_uri: "viking://resources/",
      source_path: "https://bad.example.com/",
      errors: ["Connection timeout"],
    };
    expect(r.status).toBe("failed");
    expect(r.errors).toHaveLength(1);
    expect(r.errors![0]).toBe("Connection timeout");
  });
});
