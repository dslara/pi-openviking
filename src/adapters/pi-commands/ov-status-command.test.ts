import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvStatusCommand } from "./ov-status-command";

function mockCtx(): ExtensionCommandContext {
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
  };
}

const defaultOvConfig = {
  endpoint: "http://localhost:1933",
  apiKey: "test",
  account: "pi",
  user: "default",
  timeout: 30000,
  commitTimeout: 120000,
  maxRetries: 3,
  rateLimitPerSecond: 0,
};

function mockSystemStatus(initialized: boolean, user?: string) {
  return {
    getStatus: async () => ({ initialized, user }),
  };
}

describe("ov-status command", () => {
  it("displays endpoint, session, recall state, target scope", async () => {
    const sessionService = { getActive: () => ({ toString: () => "sess-123" }) };
    const recallService = { isEnabled: () => true };
    const recallConfig = { targetUri: "viking://kb", searchMode: "find" };

    const cmd = createOvStatusCommand(
      defaultOvConfig as any,
      sessionService as any,
      recallService as any,
      recallConfig as any,
      mockSystemStatus(true, "alice") as any,
    );
    const ctx = mockCtx();
    await cmd.handler("", ctx);

    const msg = (ctx.ui.notify as any).mock.calls[0][0] as string;
    expect(msg).toContain("http://localhost:1933");
    expect(msg).toContain("sess-123");
    expect(msg).toContain("Recall: on");
    expect(msg).toContain("viking://kb");
    expect(msg).toContain("find");
    expect(msg).toContain("live");
    expect(msg).toContain("alice");
  });

  it("shows 'none' when no active session and 'unavailable' when systemStatus fails", async () => {
    const sessionService = { getActive: () => null };
    const recallService = { isEnabled: () => false };
    const recallConfig = { targetUri: undefined, searchMode: "search" };
    const failedStatus = { getStatus: async () => ({ initialized: false }) };

    const cmd = createOvStatusCommand(
      defaultOvConfig as any,
      sessionService as any,
      recallService as any,
      recallConfig as any,
      failedStatus as any,
    );
    const ctx = mockCtx();
    await cmd.handler("", ctx);

    const msg = (ctx.ui.notify as any).mock.calls[0][0] as string;
    expect(msg).toContain("none");
    expect(msg).toContain("Recall: off");
    expect(msg).toContain("(global)");
    expect(msg).toContain("unavailable");
  });

  it("handles missing systemStatus gracefully", async () => {
    const sessionService = { getActive: () => ({ toString: () => "sess-1" }) };
    const recallService = { isEnabled: () => true };
    const recallConfig = { targetUri: "viking://kb", searchMode: "find" };

    const cmd = createOvStatusCommand(
      defaultOvConfig as any,
      sessionService as any,
      recallService as any,
      recallConfig as any,
    );
    const ctx = mockCtx();
    await cmd.handler("", ctx);

    const msg = (ctx.ui.notify as any).mock.calls[0][0] as string;
    expect(msg).toContain("sess-1");
    expect(msg).toContain("unavailable");
  });
});
