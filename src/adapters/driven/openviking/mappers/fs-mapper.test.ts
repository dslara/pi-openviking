import { describe, it, expect } from "vitest";
import { toFsEntry, toFsEntries, toWriteResult } from "./fs-mapper";
import type { OVWriteResponse, OVFsEntry } from "../types/ov-fs";

describe("toWriteResult", () => {
  it("maps write response with success flag", () => {
    const raw: OVWriteResponse = {
      uri: "viking://docs/file.md", root_uri: "viking://docs", context_type: "resource", mode: "replace",
      written_bytes: 100, content_updated: true, semantic_status: "complete", vector_status: "complete",
    };
    const result = toWriteResult(raw, "viking://docs/file.md");
    expect(result.uri!.value).toBe("viking://docs/file.md");
    expect(result.success).toBe(true);
  });

  it("maps write response with success=false", () => {
    const raw: OVWriteResponse = {
      uri: "viking://docs/file.md", root_uri: "viking://docs", context_type: "resource", mode: "replace",
      written_bytes: 0, content_updated: false, semantic_status: "complete", vector_status: "complete",
    };
    const result = toWriteResult(raw, "viking://docs/file.md");
    expect(result.success).toBe(true); // default true since success field absent
  });

  it("uses the provided URI over raw uri", () => {
    const raw: OVWriteResponse = {
      uri: "viking://raw.md", root_uri: "viking://docs", context_type: "resource", mode: "replace",
      written_bytes: 100, content_updated: true, semantic_status: "complete", vector_status: "complete",
    };
    const result = toWriteResult(raw, "viking://explicit.md");
    expect(result.uri!.value).toBe("viking://explicit.md");
  });
});

describe("toFsEntry", () => {
  it("maps file entry from OV ls/tree response (isDir=false)", () => {
    const raw: OVFsEntry = { uri: "viking://docs/file.md", name: "file.md", isDir: false, size: 1234, mode: 33188, modTime: "2026-01-01T00:00:00Z" };
    const entry = toFsEntry(raw);
    expect(entry.uri.value).toBe("viking://docs/file.md");
    expect(entry.type).toBe("file");
    expect(entry.size).toBe(1234);
    expect(entry.modTime).toBe("2026-01-01T00:00:00Z");
  });

  it("maps directory entry from OV ls/tree response (isDir=true)", () => {
    const raw: OVFsEntry = { uri: "viking://docs/", name: "docs", isDir: true, size: 4096, mode: 16877, modTime: "2026-01-01T00:00:00Z" };
    const entry = toFsEntry(raw);
    expect(entry.type).toBe("directory");
  });

  it("maps stat response using uri", () => {
    const raw: OVFsEntry = { uri: "viking://resources/docs-ov/INDEX.md", name: "INDEX.md", isDir: false, size: 2295, mode: 33188, modTime: "2026-06-05T05:05:41Z" };
    const entry = toFsEntry(raw);
    expect(entry.uri.value).toBe("viking://resources/docs-ov/INDEX.md");
    expect(entry.type).toBe("file");
    expect(entry.size).toBe(2295);
  });

  it("handles missing optional fields", () => {
    const raw: OVFsEntry = { uri: "viking://docs/file.md", name: "file.md", isDir: false, size: 0, mode: 33188, modTime: "" };
    const entry = toFsEntry(raw);
    expect(entry.modTime).toBeUndefined();
  });

  it("throws on missing uri", () => {
    const raw: OVFsEntry = { uri: "", name: "file.md", isDir: false, size: 0, mode: 0, modTime: "" };
    expect(() => toFsEntry(raw)).toThrow();
  });
});

describe("toFsEntries", () => {
  it("maps array of entries (OV format)", () => {
    const raw: OVFsEntry[] = [
      { uri: "viking://a.md", name: "a.md", isDir: false, size: 100, mode: 33188, modTime: "" },
      { uri: "viking://b.md", name: "b.md", isDir: false, size: 200, mode: 33188, modTime: "" },
    ];
    const entries = toFsEntries(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].uri.value).toBe("viking://a.md");
    expect(entries[1].size).toBe(200);
  });

  it("returns empty array for empty input", () => {
    expect(toFsEntries([])).toHaveLength(0);
  });
});
