import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvProfileCommand } from "./ov-profile-command";
import type { ProfileManager } from "../../domain/profile/ProfileManager";
import type { ProfileBehavior } from "../../domain/common/profile-config";

function mockCtx(overrides?: Partial<ExtensionCommandContext>): ExtensionCommandContext {
  return {
    ui: { notify: vi.fn(), confirm: vi.fn().mockResolvedValue(true) } as any,
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

function makePM(): ProfileManager {
  return {
    getActive: vi.fn().mockReturnValue("web-dev"),
    list: vi.fn().mockReturnValue(["default", "web-dev", "docs", "learning"]),
    apply: vi.fn(),
    resolve: vi.fn().mockReturnValue({
      topN: 3,
      scoreThreshold: 0.5,
      expandGraph: true,
      autoRecall: true,
    } as ProfileBehavior),
  } as unknown as ProfileManager;
}

describe("ov-profile command", () => {
  it("shows active profile on 'show' subcommand", async () => {
    const pm = makePM();
    const cmd = createOvProfileCommand(pm, {});
    const ctx = mockCtx();

    await cmd.handler("show", ctx);

    expect(pm.getActive).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("web-dev"),
      "info",
    );
  });

  it("lists profiles on 'list' subcommand", async () => {
    const pm = makePM();
    const cmd = createOvProfileCommand(pm, {});
    const ctx = mockCtx();

    await cmd.handler("list", ctx);

    expect(pm.list).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("default"),
      "info",
    );
  });

  it("applies a profile on 'apply <name>' subcommand", async () => {
    const pm = makePM();
    const cmd = createOvProfileCommand(pm, {});
    const ctx = mockCtx();

    await cmd.handler("apply docs", ctx);

    expect(pm.apply).toHaveBeenCalledWith("docs");
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("docs"),
      "info",
    );
  });

  it("shows error for apply with unknown profile", async () => {
    const pm = makePM();
    (pm.apply as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("not found");
    });
    const cmd = createOvProfileCommand(pm, {});
    const ctx = mockCtx();

    await cmd.handler("apply ghost", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
      "warning",
    );
  });

  it("shows usage for unknown subcommand", async () => {
    const pm = makePM();
    const cmd = createOvProfileCommand(pm, {});
    const ctx = mockCtx();

    await cmd.handler("unknown", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
      "warning",
    );
  });

  it("detect re-runs autoDetectProfile", async () => {
    const pm = makePM();
    const detectFn = vi.fn().mockReturnValue("docs");
    const cmd = createOvProfileCommand(pm, {}, detectFn);
    const ctx = mockCtx();

    await cmd.handler("detect", ctx);

    expect(detectFn).toHaveBeenCalledWith("/test", {});
    expect(pm.apply).toHaveBeenCalledWith("docs");
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("docs"),
      "info",
    );
  });

  it("detect reports no match when autoDetect returns null", async () => {
    const pm = makePM();
    const detectFn = vi.fn().mockReturnValue(null);
    const cmd = createOvProfileCommand(pm, {}, detectFn);
    const ctx = mockCtx();

    await cmd.handler("detect", ctx);

    expect(detectFn).toHaveBeenCalled();
    expect(pm.apply).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No match"),
      "info",
    );
  });
});
