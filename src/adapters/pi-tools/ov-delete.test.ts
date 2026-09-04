import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../domain/common/uri";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvDeleteTool } from "./ov-delete";
import type { FsClient } from "../../domain/client/open-viking-client";

function makeFsClient(overrides?: Partial<FsClient>): FsClient {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
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

describe("ov_delete tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvDeleteTool(makeFsClient());
    expect(tool.name).toBe("ov_delete");
    expect(tool.parameters).toBeDefined();
  });

  it("delegates to client.delete with uri", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      delete: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
      }),
    });
    const tool = createOvDeleteTool(client);

    const result = await executeTool(tool, { uri: "viking://docs/a.md" });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs/a.md"));
    expect(calls[0][1]).toBeUndefined();
    expect(calls[0][2]).toBeUndefined();
    expect(getText(result)).toContain("Deleted");
  });

  it("passes recursive flag", async () => {
    const calls: unknown[][] = [];
    const client = makeFsClient({
      delete: vi.fn().mockImplementation(async (...args: unknown[]) => {
        calls.push(args);
      }),
    });
    const tool = createOvDeleteTool(client);

    await executeTool(tool, { uri: "viking://docs", recursive: true });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(new Uri("viking://docs"));
    expect(calls[0][1]).toBe(true);
    expect(calls[0][2]).toBeUndefined();
  });

  it("returns success message on delete", async () => {
    const client = makeFsClient();
    const tool = createOvDeleteTool(client);

    const result = await executeTool(tool, { uri: "viking://docs/a.md" });

    const text = getText(result);
    expect(text).toContain("Deleted");
    expect(text).toContain("viking://docs/a.md");
  });

  it("returns error on failure", async () => {
    const client = makeFsClient({
      delete: vi.fn().mockRejectedValue(new Error("permission denied")),
    });
    const tool = createOvDeleteTool(client);

    const result = await executeTool(tool, { uri: "viking://docs/a.md" });
    expect(getText(result)).toContain("Delete failed");
    expect(getText(result)).toContain("permission denied");
  });
});
