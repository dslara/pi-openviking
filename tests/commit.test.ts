import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenVikingConfig } from "../src/config";

function testConfig(): OpenVikingConfig {
  return {
    endpoint: "http://localhost",
    timeout: 5000,
    commitTimeout: 60000,
    apiKey: "key",
    account: "acc",
    user: "u",
    autoRecallLimit: 10,
    autoRecallTimeout: 5000,
    autoRecallTopN: 5,
    openVikingAutoRecall: true,
    autoRecallScoreThreshold: 0.15,
    autoRecallMaxContentChars: 500,
    autoRecallPreferAbstract: true,
    autoRecallTokenBudget: 500,
  };
}

describe("Client Adapter: commit returns CommitResult", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns full CommitResult from transport response", async () => {
    const { createClient } = await import("../src/client");
    const serverResponse = {
      session_id: "sess-abc",
      status: "committed",
      task_id: "task-42",
      archive_uri: "viking://archived/sess-abc",
      archived: true,
      trace_id: "trace-999",
    };
    const mockTransport = {
      request: vi.fn().mockResolvedValue(serverResponse),
    };

    const client = createClient(testConfig(), mockTransport as any);

    const result = await client.commit("sess-abc");

    expect(result).toEqual({
      session_id: "sess-abc",
      status: "committed",
      task_id: "task-42",
      archive_uri: "viking://archived/sess-abc",
      archived: true,
      trace_id: "trace-999",
    });
  });

  it("memcommit tool details contain task_id and archived without memories_extracted", async () => {
    const { registerMemcommitTool } = await import("../src/tools");
    const mockClient = {
      commit: vi.fn().mockResolvedValue({
        session_id: "sess-x",
        status: "committed",
        task_id: "task-99",
        archive_uri: "viking://a/sess-x",
        archived: false,
        trace_id: "trace-1",
      }),
    } as any;
    const sync = {
      getOvSessionId: () => "sess-x",
      flush: vi.fn().mockResolvedValue(undefined),
    } as any;

    const pi = { registerTool: vi.fn() } as any;
    registerMemcommitTool(pi, mockClient, sync);

    const toolDef = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const result = await toolDef.execute("tc-1", {}, undefined, () => {});

    expect(result.details).toEqual({
      task_id: "task-99",
      archived: false,
    });
    expect(result.content[0].text).toBe(
      "Committed to OpenViking. Task: task-99, Archived: false",
    );
  });
});
