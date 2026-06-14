import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvResourceTool } from "./ov-resource";
import type { FsClient } from "../../../domain/client/open-viking-client";

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    save: vi.fn().mockResolvedValue({ uri: new Uri("viking://resources/test"), success: true }),
    ...overrides,
  } as unknown as FsClient;
}

function executeTool(tool: ToolDefinition, params: Record<string, unknown>) {
  return tool.execute("test-call", params as any, undefined, undefined, {
    cwd: "/test",
    hasUI: false,
    ui: {} as any,
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
  } as any);
}

function getText(result: any): string {
  return result.content[0].text as string;
}

describe("ov_resource tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvResourceTool(makeFsClient());
    expect(tool.name).toBe("ov_resource");
    expect(tool.parameters).toBeDefined();
  });

  it("rejects URI not under viking://resources/", async () => {
    const tool = createOvResourceTool(makeFsClient());
    const result = await executeTool(tool, {
      uri: "viking://skills/test",
      content: "some content",
    });
    expect(getText(result)).toContain("must start with viking://resources/");
  });

  it("rejects non-viking URI", async () => {
    const tool = createOvResourceTool(makeFsClient());
    const result = await executeTool(tool, {
      uri: "/tmp/foo",
      content: "content",
    });
    expect(getText(result)).toContain("must start with viking://resources/");
  });

  it("delegates to client.save for valid resource URI", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      save: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return { uri: new Uri("viking://resources/test.md"), success: true };
      }),
    });
    const tool = createOvResourceTool(client);

    const result = await executeTool(tool, {
      uri: "viking://resources/test.md",
      content: "resource content",
      mode: "replace",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://resources/test.md"));
    expect(calls[0][1]).toBe("resource content");
    expect(calls[0][2]).toBe("replace");
    expect(calls[0][3]).toBeUndefined();
    expect(getText(result)).toContain("success");
  });

  it("defaults mode to undefined", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      save: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return { uri: new Uri("viking://resources/test.md"), success: true };
      }),
    });
    const tool = createOvResourceTool(client);

    await executeTool(tool, {
      uri: "viking://resources/test.md",
      content: "hello",
    });

    expect((calls[0] as [Uri, string, string | undefined])[2]).toBeUndefined();
  });

  it("returns error message on failure", async () => {
    const client = makeFsClient({
      save: vi.fn().mockRejectedValue(new Error("OV unavailable")),
    });
    const tool = createOvResourceTool(client);

    const result = await executeTool(tool, {
      uri: "viking://resources/test.md",
      content: "x",
    });

    expect(getText(result)).toContain("failed");
    expect(getText(result)).toContain("OV unavailable");
  });
});
