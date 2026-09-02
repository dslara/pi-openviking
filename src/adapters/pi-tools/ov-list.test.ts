import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvListTool } from "./ov-list";
import type { FsClient } from "../../domain/client/open-viking-client";
import type { FsEntry } from "../../domain/client/ov-types";

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    list: vi.fn().mockResolvedValue([]),
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

describe("ov_list tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvListTool(makeFsClient());
    expect(tool.name).toBe("ov_list");
    expect(tool.parameters).toBeDefined();
  });

  it("delegates to client.list with uri", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      list: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return [];
      }),
    });
    const tool = createOvListTool(client);

    const result = await executeTool(tool, { uri: "viking://docs" });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs"));
    expect(calls[0][1]).toBeUndefined();
    expect(calls[0][2]).toBeUndefined();
    const text = getText(result);
    expect(text).toContain("[]");
  });

  it("passes recursive flag", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      list: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return [];
      }),
    });
    const tool = createOvListTool(client);

    await executeTool(tool, { uri: "viking://docs", recursive: true });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs"));
    expect(calls[0][1]).toBe(true);
    expect(calls[0][2]).toBeUndefined();
  });

  it("returns entries as JSON", async () => {
    const entries: FsEntry[] = [
      { uri: new Uri("viking://docs/a.md"), type: "file", size: 100 },
      { uri: new Uri("viking://docs/sub"), type: "directory" },
    ];
    const client = makeFsClient({ list: vi.fn().mockResolvedValue(entries) });
    const tool = createOvListTool(client);

    const result = await executeTool(tool, { uri: "viking://docs" });

    const parsed = JSON.parse(getText(result));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].uri.value).toBe("viking://docs/a.md");
  });

  it("returns error on failure", async () => {
    const client = makeFsClient({
      list: vi.fn().mockRejectedValue(new Error("access denied")),
    });
    const tool = createOvListTool(client);

    const result = await executeTool(tool, { uri: "viking://docs" });
    expect(getText(result)).toContain("List failed");
    expect(getText(result)).toContain("access denied");
  });
});
