import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvStartCommand } from "./ov-start-command";

function mockCtx(overrides?: Partial<ExtensionCommandContext>): ExtensionCommandContext {
  return {
    ui: { notify: vi.fn(), confirm: vi.fn() } as any,
    cwd: "/test",
    hasUI: false,
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    signal: undefined as any,
    abort: vi.fn(),
    hasPendingMessages: () => false,
    shutdown: vi.fn(),
    getContextUsage: () => undefined,
    compact: vi.fn(),
    getSystemPrompt: () => "",
    waitForIdle: vi.fn(),
    newSession: vi.fn() as any,
    fork: vi.fn() as any,
    navigateTree: vi.fn() as any,
    switchSession: vi.fn() as any,
    reload: vi.fn() as any,
    ...overrides,
  };
}

describe("ov-start command", () => {
  it("creates a new session and notifies user", async () => {
    const sessionId = { value: "sess-abc", toString: () => "sess-abc" };
    const createAndSet = vi.fn().mockResolvedValue(sessionId);
    const sessionService = { createAndSet };
    const notify = vi.fn();
    const ctx = mockCtx({ ui: { notify } as any });

    const cmd = createOvStartCommand(sessionService as any);
    await cmd.handler("", ctx);

    expect(createAndSet).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Session created: sess-abc", "info");
  });

  it("calls widgetUpdater on session create", async () => {
    const sessionId = { value: "sess-w", toString: () => "sess-w" };
    const createAndSet = vi.fn().mockResolvedValue(sessionId);
    const sessionService = { createAndSet };
    const widgetUpdater = vi.fn();
    const ctx = mockCtx();

    const cmd = createOvStartCommand(sessionService as any, widgetUpdater);
    await cmd.handler("", ctx);

    expect(widgetUpdater).toHaveBeenCalledWith("session", "sess-w");
  });

  it("handles errors gracefully", async () => {
    const createAndSet = vi.fn().mockRejectedValue(new Error("OV unavailable"));
    const sessionService = { createAndSet };
    const notify = vi.fn();
    const ctx = mockCtx({ ui: { notify } as any });

    const cmd = createOvStartCommand(sessionService as any);
    await cmd.handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create session"),
      "error",
    );
  });

  it("has name and description", () => {
    const cmd = createOvStartCommand({ createAndSet: vi.fn() } as any);
    expect(cmd.description).toBeDefined();
    expect(cmd.description).toContain("OV session");
  });
});
