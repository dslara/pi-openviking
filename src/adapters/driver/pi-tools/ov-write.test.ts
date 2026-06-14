import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvWriteTool } from "./ov-write";
import type { FsClient } from "../../../domain/client/open-viking-client";

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    save: vi.fn().mockResolvedValue({ uri: new Uri("viking://a"), success: true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    mv: vi.fn().mockResolvedValue(undefined),
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

describe("ov_write tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvWriteTool(makeFsClient());
    expect(tool.name).toBe("ov_write");
    expect(tool.parameters).toBeDefined();
  });

  it("action=save delegates to client.save", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      save: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return { uri: new Uri("viking://docs/a.md"), success: true };
      }),
    });
    const tool = createOvWriteTool(client);

    const result = await executeTool(tool, {
      action: "save",
      uri: "viking://docs/a.md",
      content: "hello",
      mode: "replace",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/a.md"));
    expect(calls[0][1]).toBe("hello");
    expect(calls[0][2]).toBe("replace");
    expect(calls[0][3]).toBeUndefined();
    expect(getText(result)).not.toContain("failed");
  });

  it("action=mkdir delegates to client.mkdir", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      mkdir: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
      }),
    });
    const tool = createOvWriteTool(client);

    const result = await executeTool(tool, {
      action: "mkdir",
      uri: "viking://docs/new-dir",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/new-dir"));
    expect(calls[0][1]).toBeUndefined();
    expect(getText(result)).toContain("ok");
  });

  it("action=mv delegates to client.mv", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      mv: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
      }),
    });
    const tool = createOvWriteTool(client);

    const result = await executeTool(tool, {
      action: "mv",
      uri: "viking://docs/a.md",
      targetUri: "viking://docs/b.md",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/a.md"));
    expect(calls[0][1]).toEqual(new Uri("viking://docs/b.md"));
    expect(calls[0][2]).toBeUndefined();
    expect(getText(result)).toContain("ok");
  });

  it("returns error on unknown action", async () => {
    const tool = createOvWriteTool(makeFsClient());
    const result = await executeTool(tool, { action: "bogus", uri: "viking://x" });
    expect(getText(result)).toContain("failed");
  });

  it("returns error when mv called without targetUri", async () => {
    const tool = createOvWriteTool(makeFsClient());
    const result = await executeTool(tool, { action: "mv", uri: "viking://x" });
    expect(getText(result)).toContain("failed");
  });
});
