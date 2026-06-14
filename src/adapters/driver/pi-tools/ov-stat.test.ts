import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvStatTool } from "./ov-stat";
import type { FsClient } from "../../../domain/client/open-viking-client";
import type { FsEntry } from "../../../domain/ports/fs-store";

const sampleEntry: FsEntry = { uri: new Uri("viking://docs/a.md"), type: "file", size: 1024, modTime: "2025-01-01" };

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    stat: vi.fn().mockResolvedValue(sampleEntry),
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

describe("ov_stat tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvStatTool(makeFsClient());
    expect(tool.name).toBe("ov_stat");
    expect(tool.parameters).toBeDefined();
  });

  it("delegates to client.stat with uri", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      stat: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
        return sampleEntry;
      }),
    });
    const tool = createOvStatTool(client);

    await executeTool(tool, { uri: "viking://docs/a.md" });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/a.md"));
    expect(calls[0][1]).toBeUndefined();
  });

  it("returns entry as JSON", async () => {
    const client = makeFsClient();
    const tool = createOvStatTool(client);

    const result = await executeTool(tool, { uri: "viking://docs/a.md" });

    const parsed = JSON.parse(getText(result));
    expect(parsed.uri.value).toBe("viking://docs/a.md");
    expect(parsed.type).toBe("file");
    expect(parsed.size).toBe(1024);
  });

  it("returns error on failure", async () => {
    const client = makeFsClient({
      stat: vi.fn().mockRejectedValue(new Error("not found")),
    });
    const tool = createOvStatTool(client);

    const result = await executeTool(tool, { uri: "viking://missing" });
    expect(getText(result)).toContain("Stat failed");
    expect(getText(result)).toContain("not found");
  });
});
