import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvRecallCommand } from "./ov-recall-command";

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

describe("ov-recall command", () => {
  it("calls setEnabled(true) for 'on' arg", async () => {
    const setEnabled = vi.fn();
    const cmd = createOvRecallCommand({ setEnabled } as any);
    const ctx = mockCtx();

    await cmd.handler("on", ctx);

    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Recall enabled", "info");
  });

  it("calls setEnabled(false) for 'off' arg", async () => {
    const setEnabled = vi.fn();
    const cmd = createOvRecallCommand({ setEnabled } as any);
    const ctx = mockCtx();

    await cmd.handler("off", ctx);

    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Recall disabled", "info");
  });

  it("shows usage for invalid arg", async () => {
    const setEnabled = vi.fn();
    const cmd = createOvRecallCommand({ setEnabled } as any);
    const ctx = mockCtx();

    await cmd.handler("maybe", ctx);

    expect(setEnabled).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /ov-recall on|off", "warning");
  });

  it("provides argument completions", () => {
    const cmd = createOvRecallCommand({} as any);
    const completions = cmd.getArgumentCompletions!("o");
    expect(completions).toEqual([{ value: "on", label: "on" }, { value: "off", label: "off" }]);
  });

  it("shows filtered completions for 'of' prefix", () => {
    const cmd = createOvRecallCommand({} as any);
    const completions = cmd.getArgumentCompletions!("of");
    expect(completions).toEqual([{ value: "off", label: "off" }]);
  });

  it("returns null for no matching completions", () => {
    const cmd = createOvRecallCommand({} as any);
    const completions = cmd.getArgumentCompletions!("x");
    expect(completions).toBeNull();
  });

  it("calls widgetUpdater when recall is toggled on", async () => {
    const widgetUpdater = vi.fn();
    const setEnabled = vi.fn();
    const cmd = createOvRecallCommand({ setEnabled } as any, widgetUpdater);
    const ctx = mockCtx();

    await cmd.handler("on", ctx);

    expect(widgetUpdater).toHaveBeenCalledWith("recall", "on");
  });

  it("calls widgetUpdater when recall is toggled off", async () => {
    const widgetUpdater = vi.fn();
    const setEnabled = vi.fn();
    const cmd = createOvRecallCommand({ setEnabled } as any, widgetUpdater);
    const ctx = mockCtx();

    await cmd.handler("off", ctx);

    expect(widgetUpdater).toHaveBeenCalledWith("recall", "off");
  });

  it("does not call widgetUpdater for invalid arg", async () => {
    const widgetUpdater = vi.fn();
    const setEnabled = vi.fn();
    const cmd = createOvRecallCommand({ setEnabled } as any, widgetUpdater);
    const ctx = mockCtx();

    await cmd.handler("maybe", ctx);

    expect(widgetUpdater).not.toHaveBeenCalled();
  });
});
