import { describe, it, expect } from "vitest";
import type { OVFsEntry, OVWriteResponse, OVReadResponse } from "./ov-fs";

describe("OVFsEntry", () => {
  it("creates minimal entry", () => {
    const e: OVFsEntry = { name: "doc.md", size: 100, mode: 0, modTime: "", isDir: false, uri: "viking://resources/doc.md" };
    expect(e.name).toBe("doc.md");
    expect(e.size).toBe(100);
    expect(e.isDir).toBe(false);
  });

  it("includes optional fields", () => {
    const e: OVFsEntry = {
      name: "dir",
      size: 0,
      mode: 0o755,
      modTime: "2026-01-01T00:00:00Z",
      isDir: true,
      uri: "viking://resources/dir/",
      meta: { type: "directory" },
      count: 5,
    };
    expect(e.isDir).toBe(true);
    expect(e.meta).toEqual({ type: "directory" });
    expect(e.count).toBe(5);
  });
});

describe("OVWriteResponse", () => {
  it("creates write response", () => {
    const r: OVWriteResponse = {
      uri: "viking://resources/doc.md",
      root_uri: "viking://resources/",
      context_type: "resource",
      mode: "replace",
      written_bytes: 42,
      content_updated: true,
      semantic_status: "updated",
      vector_status: "pending",
    };
    expect(r.uri).toBe("viking://resources/doc.md");
    expect(r.context_type).toBe("resource");
    expect(r.mode).toBe("replace");
    expect(r.written_bytes).toBe(42);
    expect(r.content_updated).toBe(true);
    expect(r.semantic_status).toBe("updated");
  });
});

describe("OVReadResponse", () => {
  it("is a string body", () => {
    const r: OVReadResponse = "file content here";
    expect(typeof r).toBe("string");
    expect(r).toBe("file content here");
  });
});
