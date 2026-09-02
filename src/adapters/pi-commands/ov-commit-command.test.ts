import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvCommitCommand } from "./ov-commit-command";

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

describe("ov-commit command", () => {
  it("calls commit on active session", async () => {
    const sessionId = { toString: () => "sess-1" };
    const commit = vi.fn().mockResolvedValue({ taskId: "task-123" });
    const sessionService = {
      getActive: () => sessionId,
      commit,
      waitForCommit: vi.fn(),
    };
    const cmd = createOvCommitCommand(sessionService as any);
    const ctx = mockCtx();

    await cmd.handler("", ctx);

    expect(commit).toHaveBeenCalledWith(sessionId);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("task-123"),
      "info",
    );
  });

  it("shows warning when no active session", async () => {
    const sessionService = {
      getActive: () => null,
      commit: vi.fn(),
      waitForCommit: vi.fn(),
    };
    const cmd = createOvCommitCommand(sessionService as any);
    const ctx = mockCtx();

    await cmd.handler("", ctx);

    expect(sessionService.commit).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "No active session — start one first",
      "warning",
    );
  });

  it("waits for commit when --wait is passed", async () => {
    const sessionId = { toString: () => "sess-1" };
    const commit = vi.fn().mockResolvedValue({ taskId: "task-456" });
    const waitForCommit = vi.fn().mockResolvedValue({ status: "completed" });
    const sessionService = {
      getActive: () => sessionId,
      commit,
      waitForCommit,
    };
    const cmd = createOvCommitCommand(sessionService as any);
    const ctx = mockCtx();

    await cmd.handler("--wait", ctx);

    expect(commit).toHaveBeenCalledWith(sessionId);
    expect(waitForCommit).toHaveBeenCalledWith("task-456");
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("completed"),
      "info",
    );
  });

  it("handles commit error", async () => {
    const sessionId = { toString: () => "sess-1" };
    const commit = vi.fn().mockRejectedValue(new Error("OV unreachable"));
    const sessionService = {
      getActive: () => sessionId,
      commit,
      waitForCommit: vi.fn(),
    };
    const cmd = createOvCommitCommand(sessionService as any);
    const ctx = mockCtx();

    await cmd.handler("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("OV unreachable"),
      "error",
    );
  });

  it("does not wait when commit has no taskId", async () => {
    const sessionId = { toString: () => "sess-1" };
    const commit = vi.fn().mockResolvedValue({ taskId: undefined });
    const waitForCommit = vi.fn();
    const sessionService = {
      getActive: () => sessionId,
      commit,
      waitForCommit,
    };
    const cmd = createOvCommitCommand(sessionService as any);
    const ctx = mockCtx();

    await cmd.handler("--wait", ctx);

    expect(waitForCommit).not.toHaveBeenCalled();
  });

  it("calls widgetUpdater on successful wait", async () => {
    const widgetUpdater = vi.fn();
    const sessionId = { toString: () => "sess-1" };
    const commit = vi.fn().mockResolvedValue({ taskId: "task-789" });
    const waitForCommit = vi.fn().mockResolvedValue({ status: "completed" });
    const sessionService = {
      getActive: () => sessionId,
      commit,
      waitForCommit,
    };
    const cmd = createOvCommitCommand(sessionService as any, widgetUpdater);
    const ctx = mockCtx();

    await cmd.handler("--wait", ctx);

    expect(widgetUpdater).toHaveBeenCalledWith("memories", "updated");
  });

  it("does not call widgetUpdater on failed wait", async () => {
    const widgetUpdater = vi.fn();
    const sessionId = { toString: () => "sess-1" };
    const commit = vi.fn().mockResolvedValue({ taskId: "task-000" });
    const waitForCommit = vi.fn().mockResolvedValue({ status: "failed" });
    const sessionService = {
      getActive: () => sessionId,
      commit,
      waitForCommit,
    };
    const cmd = createOvCommitCommand(sessionService as any, widgetUpdater);
    const ctx = mockCtx();

    await cmd.handler("--wait", ctx);

    expect(widgetUpdater).not.toHaveBeenCalled();
  });
});
