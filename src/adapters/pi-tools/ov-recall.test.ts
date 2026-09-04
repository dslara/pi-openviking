import { describe, it, expect, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvRecallTool } from "./ov-recall";
import type { RecallService } from "../../domain/recall/recall-service";
import type { RecallResult } from "../../domain/recall/recall-service";
import type { Logger } from "../../domain/ports/logger";

const emptyResult: RecallResult = { items: [], tokens: 0, formatted: "", total: 0 };

function makeRecallService(overrides?: Partial<RecallService>): RecallService {
  return {
    recall: async () => emptyResult,
    setEnabled: () => {},
    ...overrides,
  } as RecallService;
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isEnabled: () => true,
  };
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

describe("ov_recall tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvRecallTool(makeRecallService(), makeLogger());
    expect(tool.name).toBe("ov_recall");
    expect(tool.parameters).toBeDefined();
  });

  it("calls recall with prompt and returns formatted text", async () => {
    const calls: string[] = [];
    const svc = makeRecallService({
      recall: async (prompt) => {
        calls.push(prompt);
        return {
          items: [{ uri: "viking://kb/test", text: "remembered", score: 0.9, source: "memory" as const }],
          tokens: 10,
          formatted: "[memory] viking://kb/test\nremembered",
          total: 1,
        };
      },
    });
    const tool = createOvRecallTool(svc, makeLogger());
    const result = await executeTool(tool, { prompt: "what did we decide" });
    expect(calls).toEqual(["what did we decide"]);
    expect(getText(result)).toContain("viking://kb/test");
    expect(getText(result)).toContain("remembered");
  });

  it("returns no-memories message when result is empty", async () => {
    const svc = makeRecallService({
      recall: async () => emptyResult,
    });
    const tool = createOvRecallTool(svc, makeLogger());
    const result = await executeTool(tool, { prompt: "nothing here" });
    expect(getText(result)).toContain("No relevant memories found");
  });

  it("catches errors and returns failure message", async () => {
    const svc = makeRecallService({
      recall: async () => { throw new Error("OV down"); },
    });
    const logger = makeLogger();
    const tool = createOvRecallTool(svc, logger);
    const result = await executeTool(tool, { prompt: "test" });
    expect(getText(result)).toContain("Recall failed");
    expect(getText(result)).toContain("OV down");
  });

  it("logs completion on success", async () => {
    const svc = makeRecallService({
      recall: async () => ({
        items: [{ uri: "viking://kb/test", text: "remembered", score: 0.9, source: "memory" as const }],
        tokens: 10,
        formatted: "results",
        total: 3,
      }),
    });
    const logger = makeLogger();
    const tool = createOvRecallTool(svc, logger);
    await executeTool(tool, { prompt: "test" });
    expect(logger.info).toHaveBeenCalledWith(
      "ov_recall completed",
      expect.objectContaining({ total: 3, tokens: 10 }),
    );
  });

  it("logs error on failure", async () => {
    const svc = makeRecallService({
      recall: async () => { throw new Error("timeout"); },
    });
    const logger = makeLogger();
    const tool = createOvRecallTool(svc, logger);
    await executeTool(tool, { prompt: "test" });
    expect(logger.error).toHaveBeenCalledWith(
      "ov_recall failed",
      expect.objectContaining({ error: "timeout" }),
    );
  });
});
