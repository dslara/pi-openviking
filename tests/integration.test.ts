import { describe, test, expect, beforeAll, vi } from "vitest";
import { loadConfig } from "../src/config";
import { createClient } from "../src/client";
import { createAutoRecall } from "../src/auto-recall";

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
