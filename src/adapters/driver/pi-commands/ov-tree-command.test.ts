import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../../domain/common/uri";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvTreeCommand } from "./ov-tree-command";
import type { FsClient } from "../../../domain/client/open-viking-client";

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

describe("ov-tree command", () => {
  it("shows tree for given URI", async () => {
    const tree = vi.fn().mockResolvedValue([
      { uri: new Uri("viking://docs"), type: "directory" as const },
      { uri: new Uri("viking://docs/a.md"), type: "file" as const },
      { uri: new Uri("viking://docs/sub"), type: "directory" as const },
      { uri: new Uri("viking://docs/sub/b.md"), type: "file" as const },
    ]);
    const cmd = createOvTreeCommand({ tree } as unknown as FsClient);
    const ctx = mockCtx();

    await cmd.handler("viking://docs", ctx);

    const msg = (ctx.ui.notify as any).mock.calls[0][0] as string;
    expect(msg).toContain("📁 docs");
    expect(msg).toContain("📄 a.md");
    expect(msg).toContain("📁 sub");
    expect(msg).toContain("📄 b.md");
  });

  it("defaults URI to viking://", async () => {
    const tree = vi.fn().mockResolvedValue([]);
    const cmd = createOvTreeCommand({ tree } as unknown as FsClient);
    const ctx = mockCtx();

    await cmd.handler("", ctx);

    const calledUri = tree.mock.calls[0][0];
    expect(calledUri.toString()).toBe("viking://");
    expect(tree).toHaveBeenCalledTimes(1);
  });

  it("shows (empty) for empty result", async () => {
    const tree = vi.fn().mockResolvedValue([]);
    const cmd = createOvTreeCommand({ tree } as unknown as FsClient);
    const ctx = mockCtx();

    await cmd.handler("viking://empty", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("(empty)", "info");
  });

  it("handles invalid URI", async () => {
    const tree = vi.fn();
    const cmd = createOvTreeCommand({ tree } as unknown as FsClient);
    const ctx = mockCtx();

    await cmd.handler("not-a-uri", ctx);

    expect(tree).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Invalid URI"), "warning");
  });

  it("handles service error", async () => {
    const tree = vi.fn().mockRejectedValue(new Error("connection refused"));
    const cmd = createOvTreeCommand({ tree } as unknown as FsClient);
    const ctx = mockCtx();

    await cmd.handler("viking://docs", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("connection refused"), "error");
  });
});
