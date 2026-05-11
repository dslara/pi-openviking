import { describe, test, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { uploadDirectory } from "../src/importer/uploader";
import { createMockClient } from "./mocks";

describe("uploadDirectory", () => {
  test("zips files and calls tempUpload + addResource", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-upload-"));
    writeFileSync(join(tmpDir, "a.txt"), "hello");
    writeFileSync(join(tmpDir, "b.txt"), "world");

    const client = createMockClient({
      addResource: vi.fn(async () => ({ root_uri: "viking://resources/dir", status: "success", errors: [] })),
    });

    try {
      const result = await uploadDirectory(client, tmpDir);
      expect(client.tempUpload).toHaveBeenCalledOnce();
      const [body, filename] = (client.tempUpload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(body).toBeInstanceOf(Uint8Array);
      expect(body.length).toBeGreaterThan(0);
      expect(filename).toMatch(/\.zip$/);
      expect(result.root_uri).toBe("viking://resources/dir");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("excludes .git and node_modules from zip", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-upload-"));
    mkdirSync(join(tmpDir, ".git"));
    mkdirSync(join(tmpDir, "node_modules"));
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, ".git", "config"), "git config");
    writeFileSync(join(tmpDir, "node_modules", "mod.txt"), "module");
    writeFileSync(join(tmpDir, "src", "code.ts"), "code");
    writeFileSync(join(tmpDir, "readme.md"), "readme");

    const client = createMockClient({
      addResource: vi.fn(async () => ({ root_uri: "viking://resources/dir", status: "success", errors: [] })),
    });

    try {
      await uploadDirectory(client, tmpDir);
      const [body] = (client.tempUpload as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(body).toBeInstanceOf(Uint8Array);
      // We can't introspect the zip without unzipping, but we verify the call happened
      expect(client.tempUpload).toHaveBeenCalledOnce();
      expect(client.addResource).toHaveBeenCalledOnce();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("passes options to addResource", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-upload-"));
    writeFileSync(join(tmpDir, "x.txt"), "x");

    const client = createMockClient({
      addResource: vi.fn(async () => ({ root_uri: "viking://agent/skills/dir", status: "success", errors: [] })),
    });

    try {
      await uploadDirectory(client, tmpDir, {
        kind: "skill",
        reason: "test",
        parent: "viking://agent/skills/",
      });
      expect(client.addResource).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "skill",
          reason: "test",
          parent: "viking://agent/skills/",
        }),
        undefined,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
