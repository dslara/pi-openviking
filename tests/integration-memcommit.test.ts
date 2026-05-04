import { describe, test, expect, beforeAll } from "vitest";
import { loadConfig } from "../src/config";
import { createClient } from "../src/client";
import { SessionSync } from "../src/session";
import { registerMemcommitTool } from "../src/tools";

/*
 * Integration test for memcommit — requires running OV server.
 */

const config = loadConfig(process.cwd());
const client = createClient(config);

let serverUp = false;
let sessionId: string;

beforeAll(async () => {
  try {
    sessionId = await client.createSession();
    serverUp = true;
    await client.sendMessage(sessionId, "user", "hello from integration test");
  } catch {
    // skip
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
