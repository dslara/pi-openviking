import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvTreeTool } from "./ov-tree";
import type { FsClient } from "../../domain/client/open-viking-client";
import type { FsEntry } from "../../domain/client/ov-types";

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    tree: vi.fn().mockResolvedValue([]),
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

describe("ov_tree tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvTreeTool(makeFsClient());
    expect(tool.name).toBe("ov_tree");
    expect(tool.parameters).toBeDefined();
  });

  it("delegates to client.tree with uri", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      tree: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return [];
      }),
    });
    const tool = createOvTreeTool(client);

    await executeTool(tool, { uri: "viking://" });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://"));
    expect(calls[0][1]).toBeUndefined();
  });

  it("returns entries as JSON", async () => {
    const entries: FsEntry[] = [
      { uri: new Uri("viking://docs"), type: "directory" },
      { uri: new Uri("viking://docs/a.md"), type: "file" },
    ];
    const client = makeFsClient({ tree: vi.fn().mockResolvedValue(entries) });
    const tool = createOvTreeTool(client);

    const result = await executeTool(tool, { uri: "viking://" });

    const parsed = JSON.parse(getText(result));
    expect(parsed).toHaveLength(2);
  });

  it("returns error on failure", async () => {
    const client = makeFsClient({
      tree: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    const tool = createOvTreeTool(client);

    const result = await executeTool(tool, { uri: "viking://" });
    expect(getText(result)).toContain("Tree failed");
    expect(getText(result)).toContain("timeout");
  });
});
