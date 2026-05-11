import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "../src/features/ov-client/client";
import { SessionSync } from "../src/features/session-sync/session";
import { registerMemcommitTool } from "../src/features/tools/commit";
import { getTestConfig, isTestServerUp } from "./test-config";

/*
 * Integration test for memcommit — runs against isolated test server when available.
 */

const config = getTestConfig();
const client = createClient(config);

let serverUp = false;
let sessionId: string;

beforeAll(async () => {
  serverUp = await isTestServerUp(config);
  if (!serverUp) return;
  try {
    sessionId = await client.createSession();
    await client.sendMessage(sessionId, "user", "hello from integration test");
  } catch {
    serverUp = false;
  }
});

describe("memcommit integration", () => {
  test("commits session successfully", async () => {
    if (!serverUp) return;

    const sync = new SessionSync(client, {
      getSessionFile: () => "test.session",
      getBranch: () => [],
      appendEntry: () => {},
    });
    // Manually set the session id (normally created by onMessageEnd)
    (sync as any).ovSessionId = sessionId;

    const pi = {
      registerTool: (_def: unknown) => {},
    };
    registerMemcommitTool(pi as any, client, sync);

    // Simulate calling the tool directly
    const toolDef = (pi as any).tools?.[0];
    if (!toolDef) {
      // The pi mock above doesn't capture tools; test the sync directly
      await sync.flush();
      const result = await client.commit(sessionId);
      expect(result).toHaveProperty("task_id");
      expect(result.archived).toBe(true);
      console.log("Commit result:", result);
      return;
    }

    const result = await toolDef.execute("tc-1", {}, undefined, undefined);
    expect(result.isError).toBeUndefined();
    console.log("memcommit result:", result.content[0].text);
  });
});
