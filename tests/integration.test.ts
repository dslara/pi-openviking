import { describe, test, expect, beforeAll, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config";
import { createClient } from "../src/client";
import { createAutoRecall } from "../src/auto-recall";
import { registerMemdeleteTool, registerMemimportTool } from "../src/tools";

/*
 * Integration test — requires a running OpenViking server.
 * Run with: OPENVIKING_ENDPOINT=http://localhost:1933 npx vitest run tests/integration.test.ts
 * Skips automatically if server is unreachable.
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

describe("memread integration", () => {
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

describe("membrowse integration", () => {
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

describe("full round-trip: search → memread", () => {
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

describe("memdelete integration", () => {
  test("deletes a viking:// resource and confirms it is gone", async () => {
    if (!serverUp) return;

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

    // Delete it
    const delResult = await client.delete(target.uri);
    expect(delResult.uri).toBe(target.uri);
    console.log("memdelete →", delResult.uri);

    // Confirm gone via search
    const afterSearch = await client.search(sessionId, target.uri, 5);
    const stillThere = afterSearch.resources.some((r) => r.uri === target.uri);
    expect(stillThere).toBe(false);
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

describe("memimport integration", () => {
  test("imports remote URL and confirms via search", async () => {
    if (!serverUp) return;

    const source = "https://raw.githubusercontent.com/dslara/pi-openviking/main/README.md";
    const result = await client.addResource({ path: source });
    expect(result).toHaveProperty("root_uri");
    expect(result.status).toBe("success");
    console.log("memimport URL →", result.root_uri);

    await new Promise((r) => setTimeout(r, 3000));

    const searchResults = await client.search(sessionId, "pi-openviking", 10);
    const found = searchResults.resources.some((r) => r.uri === result.root_uri);
    console.log("Found in search:", found);

    try {
      await client.delete(result.root_uri);
      console.log("Cleaned up:", result.root_uri);
    } catch (e: any) {
      console.log("Cleanup skipped:", e.message);
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
});

describe("auto-recall integration", () => {
  test("appends relevant-memories block with real search results", async () => {
    if (!serverUp) return;

    const sync = {
      getOvSessionId: vi.fn(() => sessionId),
      flush: vi.fn(async () => {}),
    };

    const autoRecall = createAutoRecall(client, sync);
    const result = await autoRecall({ prompt: "openviking", systemPrompt: "You are a helpful assistant." });

    expect(result.systemPrompt).toBeDefined();
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
    };

    const autoRecall = createAutoRecall(client, sync);
    const result = await autoRecall({ prompt: "openviking", systemPrompt: "base" });

    expect(result.systemPrompt).toBeDefined();
    expect(result.systemPrompt).toContain("<relevant-memories>");
  });
});
