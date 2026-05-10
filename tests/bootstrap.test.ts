import { describe, test, expect, vi } from "vitest";
import { bootstrapExtension } from "../src/bootstrap";

function createMockPi() {
  const handlers: Record<string, Array<(...args: any[]) => any>> = {};
  const tools: unknown[] = [];
  const commands: Record<string, { description?: string; handler: (...args: any[]) => any }> = {};

  return {
    registerTool: vi.fn((def: unknown) => {
      tools.push(def);
    }),
    registerCommand: vi.fn((name: string, options: { description?: string; handler: (...args: any[]) => any }) => {
      commands[name] = options;
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    appendEntry: vi.fn(),
    getTools: () => tools,
    getHandlers: (event: string) => handlers[event] ?? [],
    getCommand: (name: string) => commands[name],
  };
}

function createMockCtx(overrides?: {
  cwd?: string;
  getSessionFile?: () => string | undefined;
  getBranch?: () => any[];
}) {
  return {
    cwd: overrides?.cwd ?? "/test",
    sessionManager: {
      getSessionFile: overrides?.getSessionFile ?? (() => "/test/session.json"),
      getBranch: overrides?.getBranch ?? (() => []),
    },
  };
}

describe("bootstrapExtension", () => {
  test("registers 6 tools", () => {
    const pi = createMockPi();
    const ctx = createMockCtx();

    const result = bootstrapExtension(pi as any, ctx);

    expect(pi.registerTool).toHaveBeenCalledTimes(6);
    expect(result.sessionSync).toBeDefined();
  });

  test("registers before_agent_start handler", () => {
    const pi = createMockPi();
    const ctx = createMockCtx();

    bootstrapExtension(pi as any, ctx);

    const handlers = pi.getHandlers("before_agent_start");
    expect(handlers.length).toBe(1);
  });

  test("sessionSync delegates to sessionManager", () => {
    const pi = createMockPi();
    const getBranch = vi.fn(() => [
      { type: "custom", customType: "ov-session", data: { ovSessionId: "restored" } },
    ]);
    const ctx = createMockCtx({ getBranch });

    const result = bootstrapExtension(pi as any, ctx);

    result.sessionSync.onSessionStart();
    expect(getBranch).toHaveBeenCalled();
    expect(result.sessionSync.getOvSessionId()).toBe("restored");
  });

  test("sessionSync delegates appendEntry to pi", async () => {
    const pi = createMockPi();
    const ctx = createMockCtx();

    const result = bootstrapExtension(pi as any, ctx);

    result.sessionSync.onMessageEnd({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    } as any);

    await vi.waitFor(() => {
      expect(pi.appendEntry).toHaveBeenCalledWith("ov-session", expect.any(Object));
    });
  });

  test("registers /ov-commit command", () => {
    const pi = createMockPi();
    const ctx = createMockCtx();

    bootstrapExtension(pi as any, ctx);

    expect(pi.registerCommand).toHaveBeenCalledWith("ov-commit", expect.objectContaining({
      description: expect.stringContaining("Commit"),
    }));
  });

  test("/ov-commit command notifies success with task_id", async () => {
    const pi = createMockPi();
    const ctx = createMockCtx();

    const result = bootstrapExtension(pi as any, ctx);
    result.sessionSync.onMessageEnd({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    } as any);
    await vi.waitFor(() => expect(result.sessionSync.getOvSessionId()).toBeDefined());

    const command = (pi as any).getCommand("ov-commit");
    expect(command).toBeDefined();

    const notify = vi.fn();
    const cmdCtx = { ui: { notify }, hasUI: true } as any;

    await command.handler("", cmdCtx);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("✓ Session committed. Task:"), "info");
  });

  test("/ov-commit command notifies error when no session", async () => {
    const pi = createMockPi();
    const ctx = createMockCtx();

    bootstrapExtension(pi as any, ctx);

    const command = (pi as any).getCommand("ov-commit");
    const notify = vi.fn();
    const cmdCtx = { ui: { notify }, hasUI: true } as any;

    await command.handler("", cmdCtx);
    expect(notify).toHaveBeenCalledWith("✗ Commit failed: No OpenViking session mapped", "error");
  });
});
