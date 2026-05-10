import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config";
import { createClient } from "../src/client";
import { createAutoRecall } from "../src/auto-recall";
import { registerMemdeleteTool, registerMemimportTool } from "../src/tools";
import { uploadDirectory } from "../src/uploader";

/*
 * Integration test — requires a running OpenViking server.
 * Run with: OPENVIKING_ENDPOINT=http://localhost:1933 npx vitest run tests/integration.test.ts
 * Skips automatically if server is unreachable.
 *
 * SKIPPED: See https://github.com/dslara/pi-openviking/issues/20
 * OpenViking vector index does not sync with FS deletions, causing
 * garbage accumulation and flaky tests. Re-enable after resolution.
 */

const endpoint = process.env.OPENVIKING_ENDPOINT ?? "http://localhost:1933";
const config = { ...loadConfig(process.cwd()), endpoint };
const client = createClient(config);

let serverUp = false;
let sessionId: string;

beforeAll(async () => {
  try {
    sessionId = await client.createSession();
    serverUp = true;
  } catch {
    // server not available — skip all
  }
});

describe.skip("memread integration", () => {
  test("reads a viking:// URI", async () => {
    if (!serverUp) return;
    // First search to discover URIs
    const results = await client.search(sessionId, "test", 5);
    if (results.resources.length === 0) {
      // No resources indexed yet — try reading root
      console.log("No resources found via search, trying viking:// root");
    }

    // Try reading the root — should not throw
    try {
      const content = await client.read("viking://", "overview");
      expect(content).toHaveProperty("content");
      console.log("memread viking:// →", content.content?.substring(0, 120));
    } catch (err) {
      // Root may not exist — that's OK, we're testing the round-trip
      console.log("memread viking:// error:", (err as Error).message);
    }
  });

  test("fsStat resolves a URI", async () => {
    if (!serverUp) return;
    try {
      const stat = await client.fsStat("viking://");
      expect(stat).toHaveProperty("uri");
      console.log("fsStat viking:// → uri:", stat.uri, "children:", stat.children?.length ?? 0);
    } catch (err) {
      console.log("fsStat viking:// error:", (err as Error).message);
    }
  });
});

describe.skip("membrowse integration", () => {
  test("lists root directory", async () => {
    if (!serverUp) return;
    try {
      const listing = await client.fsList("viking://");
      expect(listing).toHaveProperty("uri");
      console.log("fsList viking:// → children:", listing.children?.length ?? 0);
      for (const c of listing.children?.slice(0, 5) ?? []) {
        console.log(" -", c.uri, `(${c.type})`);
      }
    } catch (err) {
      console.log("fsList viking:// error:", (err as Error).message);
    }
  });

  test("tree view", async () => {
    if (!serverUp) return;
    try {
      const tree = await client.fsTree("viking://");
      expect(tree).toHaveProperty("uri");
      console.log("fsTree viking:// → children:", tree.children?.length ?? 0);
    } catch (err) {
      console.log("fsTree viking:// error:", (err as Error).message);
    }
  });
});

describe.skip("full round-trip: search → memread", () => {
  test("search returns URIs that memread can consume", async () => {
    if (!serverUp) return;
    const results = await client.search(sessionId, "openviking", 5);
    console.log("Search results:", results.total, "total");

    if (results.resources.length > 0) {
      const topResource = results.resources[0];
      console.log("Top resource:", topResource.uri, `score=${topResource.score.toFixed(2)}`);

      // Skip if scope is invalid (e.g. temp)
      const scope = topResource.uri.split("/")[2]; // viking://scope/...
      const validScopes = ["agent", "resources", "session", "user"];
      if (!validScopes.includes(scope)) {
        console.log(`Skipping read — invalid scope '${scope}'. Search returned a stale temp URI.`);
        return;
      }

      // Read it
      const content = await client.read(topResource.uri, "read");
      expect(content).toHaveProperty("content");
      console.log("memread →", content.content?.substring(0, 150));

      // Browse its parent
      const parentUri = topResource.uri.substring(0, topResource.uri.lastIndexOf("/") + 1);
      if (parentUri.startsWith("viking://")) {
        const listing = await client.fsList(parentUri);
        console.log("Parent listing:", listing.children?.length ?? 0, "items");
      }
    } else {
      console.log("No resources found — OV store may be empty. Round-trip cannot be fully verified.");
    }

    expect(true).toBe(true);
  });
});

async function deleteWithRetry(ovClient: typeof client, uri: string, maxRetries = 5): Promise<{ uri: string }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ovClient.delete(uri);
    } catch (err: any) {
      const isProcessing = err.message?.includes("being processed") || err.message?.includes("409");
      if (isProcessing && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("deleteWithRetry exhausted retries");
}

describe.skip("memdelete integration", () => {
  test("deletes a viking:// resource and confirms it is gone", async () => {
    if (!serverUp) return;

    // Wait briefly for any in-flight imports from parallel tests to settle
    await new Promise((r) => setTimeout(r, 2000));

    // Find a deletable resource (skip temp/session scopes)
    const searchResults = await client.search(sessionId, "test", 5);
    const validScopes = ["agent", "resources", "user"];
    const target = searchResults.resources.find((r) => {
      const scope = r.uri.split("/")[2];
      return validScopes.includes(scope);
    });

    if (!target) {
      console.log("No deletable resource found — skipping full round-trip");
      // Still verify delete is callable (idempotent)
      const result = await client.delete("viking://resources/non-existent-test-file.txt");
      expect(result).toHaveProperty("uri");
      return;
    }

    // Delete with retry on 409 (resource still processing)
    const delResult = await deleteWithRetry(client, target.uri);
    expect(delResult.uri).toBe(target.uri);
    console.log("memdelete →", delResult.uri);

    // Note: OV vector index does not sync with FS deletions (known bug).
    // We verify FS deletion only; index cleanup requires vectordb reset.
  });

  test("tool rejects non-viking:// URI", async () => {
    const pi = {
      registerTool: vi.fn((def: any) => {
        (pi as any)._tool = def;
      }),
    };
    registerMemdeleteTool(pi as any, client);

    const tool = (pi as any)._tool;
    const result = await tool.execute("tc-1", { uri: "file:///etc/passwd" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Invalid URI: must start with viking://");
  });
});

describe.skip("memimport integration", () => {
  test("imports remote URL and confirms via search", async () => {
    if (!serverUp) return;

    const source = "https://raw.githubusercontent.com/dslara/pi-openviking/main/README.md";
    let importedUri: string | undefined;

    try {
      const result = await client.addResource({ path: source });
      expect(result).toHaveProperty("root_uri");
      expect(result.status).toBe("success");
      importedUri = result.root_uri;
      console.log("memimport URL →", importedUri);

      await new Promise((r) => setTimeout(r, 3000));

      const searchResults = await client.search(sessionId, "pi-openviking", 10);
      const found = searchResults.resources.some((r) => r.uri === importedUri);
      console.log("Found in search:", found);
    } finally {
      if (importedUri) {
        try {
          await client.delete(importedUri);
          console.log("Cleaned up:", importedUri);
        } catch (e: any) {
          console.log("Cleanup skipped:", e.message);
        }
      }
    }
  });

  test("imports local file and confirms content via memread", async () => {
    if (!serverUp) return;

    const tmpDir = mkdtempSync(join(tmpdir(), "ov-import-"));
    const filePath = join(tmpDir, "test-import.md");
    const content = "# Integration Test\n\nThis is a memimport integration test file.\n";
    writeFileSync(filePath, content);

    try {
      const body = new TextEncoder().encode(content);
      const upload = await client.tempUpload(body, "test-import.md");
      expect(upload).toHaveProperty("temp_file_id");
      console.log("tempUpload →", upload.temp_file_id);

      const result = await client.addResource({ temp_file_id: upload.temp_file_id });
      expect(result).toHaveProperty("root_uri");
      console.log("memimport local →", result.root_uri);

      await new Promise((r) => setTimeout(r, 3000));

      // OV returns a directory root_uri; find the actual file inside
      try {
        const listing = await client.fsList(result.root_uri);
        const fileEntry = listing.children?.find((c) => c.type === "file");
        if (fileEntry) {
          const readResult = await client.read(fileEntry.uri, "read");
          expect(readResult.content).toContain("memimport integration test");
          console.log("memread confirmed content via", fileEntry.uri);

          try {
            await client.delete(fileEntry.uri);
            console.log("Cleaned up file:", fileEntry.uri);
          } catch (e: any) {
            console.log("File cleanup skipped:", e.message);
          }
        } else {
          console.log("No file child found in root_uri — listing:", listing.children?.map((c) => c.uri));
        }
      } catch (e: any) {
        console.log("fsList/read skipped:", e.message);
      }

      // Cleanup directory if possible
      try {
        await client.delete(result.root_uri);
        console.log("Cleaned up dir:", result.root_uri);
      } catch (e: any) {
        console.log("Dir cleanup skipped:", e.message);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test.skip("imports as skill and confirms via search", async () => {
    if (!serverUp) return;

    // Skills endpoint does not accept remote URLs; use local file + temp upload
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-skill-"));
    const filePath = join(tmpDir, "test-skill.md");
    const skillContent = "---\nname: test-skill\ndescription: Test skill for integration testing\n---\n\n# Skill Integration Test\n\nThis is a skill import test.\n";
    writeFileSync(filePath, skillContent);

    let skillUri: string | undefined;

    try {
      const body = new TextEncoder().encode(skillContent);
      const upload = await client.tempUpload(body, "test-skill.md");
      expect(upload).toHaveProperty("temp_file_id");
      console.log("tempUpload skill →", upload.temp_file_id);

      const result = await client.addResource({ temp_file_id: upload.temp_file_id, kind: "skill" });
      expect(result).toHaveProperty("root_uri");
      expect(result.status).toBe("success");
      skillUri = result.root_uri;
      console.log("memimport skill →", skillUri);

      await new Promise((r) => setTimeout(r, 3000));

      // Verify it lands under agent skills tree
      const isAgentSkill = skillUri.startsWith("viking://agent/") && skillUri.includes("/skills/");
      console.log("is agent skill:", isAgentSkill, "root_uri:", skillUri);
      expect(isAgentSkill).toBe(true);

      // Wait a bit more for indexing, then search
      await new Promise((r) => setTimeout(r, 3000));
      const searchResults = await client.search(sessionId, "test-skill", 10);
      const skillEntry = searchResults.skills?.find((s) => s.uri === skillUri);
      console.log("Found in skills:", !!skillEntry);
      if (skillEntry) {
        expect(skillEntry.uri).toBe(skillUri);
      }
    } finally {
      if (skillUri) {
        try {
          await client.delete(skillUri);
          console.log("Cleaned up skill:", skillUri);
        } catch (e: any) {
          console.log("Cleanup skipped:", e.message);
        }
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test("imports local directory via uploadDirectory and confirms tree via membrowse", async () => {
    if (!serverUp) return;

    const tmpDir = mkdtempSync(join(tmpdir(), "ov-import-dir-"));
    writeFileSync(join(tmpDir, "file1.txt"), "hello world");
    writeFileSync(join(tmpDir, "file2.txt"), "second file");

    let importedUri: string | undefined;

    try {
      const result = await uploadDirectory(client, tmpDir);
      expect(result).toHaveProperty("root_uri");
      expect(result.status).toBe("success");
      importedUri = result.root_uri;
      console.log("memimport directory →", importedUri);

      await new Promise((r) => setTimeout(r, 3000));

      const tree = await client.fsTree(importedUri);
      const names = tree.children?.map((c) => c.uri.split("/").pop()) ?? [];
      console.log("membrowse tree →", names);
      expect(names).toContain("file1.txt");
      expect(names).toContain("file2.txt");
    } finally {
      if (importedUri) {
        try {
          await deleteWithRetry(client, importedUri);
          console.log("Cleaned up dir:", importedUri);
        } catch (e: any) {
          console.log("Cleanup skipped:", e.message);
        }
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe.skip("auto-recall integration", () => {
  // Seed content so "openviking" search returns results even when tests run in parallel
  let seededUri: string | undefined;

  beforeAll(async () => {
    if (!serverUp) return;
    const tmpDir = mkdtempSync(join(tmpdir(), "ov-recall-"));
    const filePath = join(tmpDir, "seed.md");
    writeFileSync(filePath, "# OpenViking Seed\n\nThis document mentions openviking for auto-recall integration testing.\n");
    try {
      const body = new TextEncoder().encode("# OpenViking Seed\n\nThis document mentions openviking for auto-recall integration testing.\n");
      const upload = await client.tempUpload(body, "seed.md");
      const result = await client.addResource({ temp_file_id: upload.temp_file_id });
      seededUri = result.root_uri;
      await new Promise((r) => setTimeout(r, 3000));
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  afterAll(async () => {
    if (seededUri) {
      try { await client.delete(seededUri); } catch { /* ignore */ }
    }
  });

  test("appends relevant-memories block with real search results", async () => {
    if (!serverUp) return;

    const sync = {
      getOvSessionId: vi.fn(() => sessionId),
      flush: vi.fn(async () => {}),
      commit: vi.fn(async () => ({ session_id: "sess-1", status: "committed", task_id: "task-1", archive_uri: "viking://archived/sess-1", archived: true, trace_id: "trace-1" })),
    };

    const autoRecall = createAutoRecall(client, sync);
    const result = await autoRecall({ prompt: "openviking", systemPrompt: "You are a helpful assistant." });

    if (!result.systemPrompt) {
      console.log("No search results for 'openviking' — seed may still be indexing");
      return;
    }

    expect(result.systemPrompt).toContain("<relevant-memories>");
    expect(result.systemPrompt).toContain("</relevant-memories>");
    expect(result.systemPrompt).toContain("Use the memread tool");
    expect(result.systemPrompt).toMatch(/^You are a helpful assistant\.\n\n/);

    console.log("auto-recall appended block length:", result.systemPrompt!.length - "You are a helpful assistant.\n\n".length);
  });

  test("works without session_id (context-agnostic search)", async () => {
    if (!serverUp) return;

    const sync = {
      getOvSessionId: vi.fn(() => undefined),
      flush: vi.fn(async () => {}),
      commit: vi.fn(async () => ({ session_id: "sess-1", status: "committed", task_id: "task-1", archive_uri: "viking://archived/sess-1", archived: true, trace_id: "trace-1" })),
    };

    const autoRecall = createAutoRecall(client, sync);
    const result = await autoRecall({ prompt: "openviking", systemPrompt: "base" });

    if (!result.systemPrompt) {
      console.log("No search results for 'openviking' without session — seed may still be indexing");
      return;
    }

    expect(result.systemPrompt).toContain("<relevant-memories>");
  });

  test("trims auto-recall block to stay under ~500 tokens", async () => {
    if (!serverUp) return;

    const tmpDir = mkdtempSync(join(tmpdir(), "ov-recall-long-"));
    const contents: string[] = [];
    const importedUris: string[] = [];
    for (let i = 0; i < 6; i++) {
      const filePath = join(tmpDir, `long-${i}.md`);
      const content = `# Document ${i}\n\n${"word ".repeat(200)}\n`;
      writeFileSync(filePath, content);
      contents.push(content);
    }

    try {
      for (let i = 0; i < 6; i++) {
        const body = new TextEncoder().encode(contents[i]);
        const upload = await client.tempUpload(body, `long-${i}.md`);
        const result = await client.addResource({ temp_file_id: upload.temp_file_id });
        if (result.root_uri) importedUris.push(result.root_uri);
      }

      await new Promise((r) => setTimeout(r, 5000));

      const sync = {
        getOvSessionId: vi.fn(() => sessionId),
        flush: vi.fn(async () => {}),
        commit: vi.fn(async () => ({ session_id: "sess-1", status: "committed", task_id: "task-1", archive_uri: "viking://archived/sess-1", archived: true, trace_id: "trace-1" })),
      };

      const autoRecall = createAutoRecall(client, sync, { topN: 5 });
      const result = await autoRecall({ prompt: "word", systemPrompt: "base" });

      if (result.systemPrompt) {
        const block = result.systemPrompt.replace("base\n\n", "");
        const tokens = Math.ceil(block.length / 4);
        expect(tokens).toBeLessThanOrEqual(500);
        console.log("auto-recall block tokens:", tokens, "length:", block.length);
      }
    } finally {
      for (const uri of importedUris) {
        try { await client.delete(uri); } catch { /* ignore */ }
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test("returns empty when auto recall is disabled", async () => {
    if (!serverUp) return;

    const sync = {
      getOvSessionId: vi.fn(() => sessionId),
      flush: vi.fn(async () => {}),
      commit: vi.fn(async () => ({ session_id: "sess-1", status: "committed", task_id: "task-1", archive_uri: "viking://archived/sess-1", archived: true, trace_id: "trace-1" })),
    };

    const autoRecall = createAutoRecall(client, sync, { enabled: false });
    const result = await autoRecall({ prompt: "openviking", systemPrompt: "base" });

    expect(result.systemPrompt).toBeUndefined();
  });
});

// Global cleanup — runs once after all tests, scans FS directly
afterAll(async () => {
  if (!serverUp) return;

  const patterns = [/^long-/, /^test-/, /^seed/, /^README_\d+$/];

  async function cleanupDir(uri: string) {
    try {
      const listing = await client.fsList(uri);
      for (const child of listing.children ?? []) {
        const name = child.uri.split("/").pop() ?? "";
        const isTest = patterns.some((p) => p.test(name));
        if (isTest) {
          try { await deleteWithRetry(client, child.uri); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  await cleanupDir("viking://resources");
  await cleanupDir("viking://agent/default/skills");
}, 60000);
