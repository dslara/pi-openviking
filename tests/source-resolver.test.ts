import { describe, test, expect } from "vitest";
import { resolveSource } from "../src/features/importer/source-resolver";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("resolveSource", () => {
  test("resolves http URL", async () => {
    const result = await resolveSource("https://example.com/doc.md", "resource");
    expect(result.type).toBe("url");
    if (result.type !== "url") return;
    expect(result.params.path).toBe("https://example.com/doc.md");
    expect(result.params.kind).toBe("resource");
    expect(result.params.reason).toBeUndefined();
    expect(result.params.parent).toBeUndefined();
  });

  test("resolves git URL", async () => {
    const result = await resolveSource("git://github.com/repo", "skill");
    expect(result.type).toBe("url");
    if (result.type !== "url") return;
    expect(result.params.path).toBe("git://github.com/repo");
    expect(result.params.kind).toBe("skill");
  });

  test("resolves URL with reason and to", async () => {
    const result = await resolveSource("https://example.com/doc.md", "resource", "docs", "viking://resources/");
    if (result.type !== "url") return;
    expect(result.params.reason).toBe("docs");
    expect(result.params.parent).toBe("viking://resources/");
  });

  test("resolves local file", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-src-"));
    const filePath = join(tmpDir, "test.txt");
    writeFileSync(filePath, "hello world");

    try {
      const result = await resolveSource(filePath, "resource");
      expect(result.type).toBe("file");
      if (result.type !== "file") return;
      expect(result.filename).toBe("test.txt");
      expect(result.body.toString()).toBe("hello world");
      expect(result.params.kind).toBe("resource");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("resolves local file with reason and to", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-src-"));
    const filePath = join(tmpDir, "notes.md");
    writeFileSync(filePath, "content");

    try {
      const result = await resolveSource(filePath, "skill", "import skill", "viking://agent/skills/");
      if (result.type !== "file") return;
      expect(result.params.reason).toBe("import skill");
      expect(result.params.parent).toBe("viking://agent/skills/");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("resolves directory", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-src-"));
    writeFileSync(join(tmpDir, "file1.txt"), "a");
    mkdirSync(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "sub", "file2.txt"), "b");

    try {
      const result = await resolveSource(tmpDir, "resource");
      expect(result.type).toBe("directory");
      if (result.type !== "directory") return;
      expect(typeof result.upload).toBe("function");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("directory upload thunk delegates to uploadDirectory", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-src-"));
    writeFileSync(join(tmpDir, "readme.md"), "# Hello");

    try {
      const result = await resolveSource(tmpDir, "skill", "my reason", "viking://agent/skills/");
      expect(result.type).toBe("directory");
      if (result.type !== "directory") return;

      const mockClient = {
        tempUpload: async () => ({ temp_file_id: "tmp-123" }),
        addResource: async (params: any) => {
          // Verify uploadDirectory passes through kind, reason, parent
          expect(params.kind).toBe("skill");
          // reason is stripped for skills by client.addResource, but uploadDirectory passes it through
          return { root_uri: "viking://agent/skills/readme/", status: "success", errors: [] };
        },
      } as any;

      const importResult = await result.upload(mockClient);
      expect(importResult.root_uri).toBe("viking://agent/skills/readme/");
      expect(importResult.status).toBe("success");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("throws for non-existent path", async () => {
    await expect(resolveSource("/nonexistent/path/file.txt", "resource")).rejects.toThrow();
  });
});
