import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvReadTool } from "./ov-read";
import type { FsClient } from "../../../domain/client/open-viking-client";
import type { Content } from "../../../domain/client/ov-types";

const sampleContent: Content = { uri: new Uri("viking://docs/a.md"), body: "file content", level: "read" };

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    read: vi.fn().mockResolvedValue(sampleContent),
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

describe("ov_read tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvReadTool(makeFsClient());
    expect(tool.name).toBe("ov_read");
    expect(tool.parameters).toBeDefined();
  });

  it("delegates to client.read with defaults", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      read: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return sampleContent;
      }),
    });
    const tool = createOvReadTool(client);

    const result = await executeTool(tool, { uri: "viking://docs/a.md" });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/a.md"));
    expect(calls[0][1]).toBeUndefined();
    expect(calls[0][2]).toBeUndefined();
    expect(calls[0][3]).toBeUndefined();
    expect(calls[0][4]).toBeUndefined();
    expect(getText(result)).toContain("file content");
  });

  it("passes level, offset, limit to client.read", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      read: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return sampleContent;
      }),
    });
    const tool = createOvReadTool(client);

    await executeTool(tool, { uri: "viking://docs/a.md", level: "read", offset: 10, limit: 50 });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/a.md"));
    expect(calls[0][1]).toBe("read");
    expect(calls[0][2]).toBe(10);
    expect(calls[0][3]).toBe(50);
    expect(calls[0][4]).toBeUndefined();
  });

  it("returns error text on failure", async () => {
    const client = makeFsClient({
      read: vi.fn().mockRejectedValue(new Error("not found")),
    });
    const tool = createOvReadTool(client);

    const result = await executeTool(tool, { uri: "viking://missing" });
    expect(getText(result)).toContain("Read failed");
    expect(getText(result)).toContain("not found");
  });
});
