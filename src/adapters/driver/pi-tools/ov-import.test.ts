import { describe, it, expect, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvImportTool } from "./ov-import";
import type { ResourceImportResult } from "../../../domain/client/ov-types";
import type { ResourceClient } from "../../../domain/client/open-viking-client";
import type { Logger } from "../../../domain/ports/logger";

function makeStore(overrides?: Partial<ResourceClient>): ResourceClient {
  return {
    importUrl: vi.fn().mockResolvedValue({
      status: "success",
      rootUri: "viking://resources/doc.md",
      sourcePath: "https://example.com/doc.md",
    }),
    ...overrides,
  } as ResourceClient;
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

const TOOL_PARAMS = {
  url: "https://example.com/doc.md",
  targetUri: "viking://resources/custom.md",
  reason: "Importing docs",
  wait: true,
};

describe("ov_import tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvImportTool(makeStore(), makeLogger());
    expect(tool.name).toBe("ov_import");
    expect(tool.parameters).toBeDefined();
  });

  it("calls store.importUrl with url and options", async () => {
    const svc = makeStore();
    const tool = createOvImportTool(svc, makeLogger());

    await executeTool(tool, TOOL_PARAMS);

    expect(svc.importUrl).toHaveBeenCalledWith(
      "https://example.com/doc.md",
      {
        targetUri: "viking://resources/custom.md",
        reason: "Importing docs",
        wait: true,
      },
      undefined,
    );
  });

  it("returns success result as JSON text", async () => {
    const svc = makeStore();
    const tool = createOvImportTool(svc, makeLogger());

    const result = await executeTool(tool, TOOL_PARAMS);

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(getText(result));
    expect(parsed.status).toBe("success");
    expect(parsed.rootUri).toBe("viking://resources/doc.md");
  });

  it("handles missing optional params gracefully", async () => {
    const svc = makeStore();
    const tool = createOvImportTool(svc, makeLogger());

    await executeTool(tool, { url: "https://example.com/doc.md" });

    expect(svc.importUrl).toHaveBeenCalledWith(
      "https://example.com/doc.md",
      { targetUri: undefined, reason: undefined, wait: undefined },
      undefined,
    );
  });

  it("returns error message on failure", async () => {
    const svc = makeStore({ importUrl: vi.fn().mockRejectedValue(new Error("OV unreachable")) });
    const tool = createOvImportTool(svc, makeLogger());

    const result = await executeTool(tool, TOOL_PARAMS);

    expect(getText(result)).toContain("Import failed: OV unreachable");
  });

  it("handles non-Error rejection", async () => {
    const svc = makeStore({ importUrl: vi.fn().mockRejectedValue("string error") });
    const tool = createOvImportTool(svc, makeLogger());

    const result = await executeTool(tool, TOOL_PARAMS);

    expect(getText(result)).toContain("string error");
  });

  it("returns import result with rootUri and sourcePath", async () => {
    const importResult: ResourceImportResult = {
      status: "success",
      rootUri: "viking://resources/guide.md",
      sourcePath: "https://example.com/guide.md",
    };
    const svc = makeStore({ importUrl: vi.fn().mockResolvedValue(importResult) });
    const tool = createOvImportTool(svc, makeLogger());

    const result = await executeTool(tool, { url: "https://example.com/guide.md" });

    const parsed = JSON.parse(getText(result));
    expect(parsed.rootUri).toBe("viking://resources/guide.md");
    expect(parsed.sourcePath).toBe("https://example.com/guide.md");
  });

  it("logs completion on success", async () => {
    const svc = makeStore();
    const logger = makeLogger();
    const tool = createOvImportTool(svc, logger);
    await executeTool(tool, { url: "https://example.com/doc.md" });
    expect(logger.info).toHaveBeenCalledWith(
      "ov_import completed",
      expect.objectContaining({ status: "success" }),
    );
  });

  it("logs error on failure", async () => {
    const svc = makeStore({ importUrl: vi.fn().mockRejectedValue(new Error("timeout")) });
    const logger = makeLogger();
    const tool = createOvImportTool(svc, logger);
    await executeTool(tool, { url: "https://example.com/doc.md" });
    expect(logger.error).toHaveBeenCalledWith(
      "ov_import failed",
      expect.objectContaining({ error: "timeout" }),
    );
  });
});
