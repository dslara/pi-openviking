import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../domain/common/uri";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvDeleteCommand } from "./ov-delete-command";
import type { FsClient } from "../../domain/client/open-viking-client";
import type { SearchClient } from "../../domain/client/open-viking-client";

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

function makeKB(): SearchClient {
  return {
    find: vi.fn(),
    search: vi.fn(),
    glob: vi.fn(),
    grep: vi.fn(),
  };
}

describe("ov-delete command", () => {
  it("calls client.delete after user confirms for literal URI", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockResolvedValue(true);
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      makeKB(),
    );
    const ctx = mockCtx({ ui: { notify: vi.fn(), confirm } as any });

    await cmd.handler("viking://docs/old.md", ctx);

    expect(confirm).toHaveBeenCalled();
    const calledUri = del.mock.calls[0][0];
    expect(calledUri.toString()).toBe("viking://docs/old.md");
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      "Deleted: viking://docs/old.md",
      "info",
    );
  });

  it("does not delete when user cancels for literal URI", async () => {
    const del = vi.fn();
    const confirm = vi.fn().mockResolvedValue(false);
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      makeKB(),
    );
    const ctx = mockCtx({ ui: { notify: vi.fn(), confirm } as any });

    await cmd.handler("viking://docs/safe.md", ctx);

    expect(del).not.toHaveBeenCalled();
    expect((ctx.ui as any).notify).toHaveBeenCalledWith("Delete cancelled.", "info");
  });

  it("shows usage for empty URI", async () => {
    const del = vi.fn();
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      makeKB(),
    );
    const ctx = mockCtx();

    await cmd.handler("  ", ctx);

    expect(del).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /ov-delete <uri>", "warning");
  });

  it("rejects invalid URI", async () => {
    const del = vi.fn();
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      makeKB(),
    );
    const ctx = mockCtx();

    await cmd.handler("not-a-uri", ctx);

    expect(del).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Invalid URI"),
      "warning",
    );
  });

  it("handles delete error for literal URI", async () => {
    const del = vi.fn().mockRejectedValue(new Error("permission denied"));
    const confirm = vi.fn().mockResolvedValue(true);
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      makeKB(),
    );
    const ctx = mockCtx({ ui: { notify: vi.fn(), confirm } as any });

    await cmd.handler("viking://docs/protected.md", ctx);

    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      expect.stringContaining("permission denied"),
      "error",
    );
  });

  it("resolves glob pattern and deletes matched URIs", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockResolvedValue(true);
    const kb = makeKB();
    vi.mocked(kb.glob).mockResolvedValue({
      entries: ["viking://resources/temp/a.md", "viking://resources/temp/b.md"],
      total: 2,
    });
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      kb,
    );
    const ctx = mockCtx({ ui: { notify: vi.fn(), confirm } as any });

    await cmd.handler("viking://resources/temp/*", ctx);

    expect(confirm).toHaveBeenCalledWith(
      "Confirm Delete",
      "This will delete 2 resources. Continue?",
    );
    expect(del).toHaveBeenCalledTimes(2);
    expect(del.mock.calls[0][0].toString()).toBe("viking://resources/temp/a.md");
    expect(del.mock.calls[1][0].toString()).toBe("viking://resources/temp/b.md");
    expect((ctx.ui as any).notify).toHaveBeenCalledWith(
      "Deleted 2 resources matching viking://resources/temp/*",
      "info",
    );
  });

  it("cancels glob delete when user says no", async () => {
    const del = vi.fn();
    const confirm = vi.fn().mockResolvedValue(false);
    const kb = makeKB();
    vi.mocked(kb.glob).mockResolvedValue({
      entries: ["viking://resources/temp/x.md"],
      total: 1,
    });
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      kb,
    );
    const ctx = mockCtx({ ui: { notify: vi.fn(), confirm } as any });

    await cmd.handler("viking://resources/temp/*", ctx);

    expect(del).not.toHaveBeenCalled();
    expect((ctx.ui as any).notify).toHaveBeenCalledWith("Delete cancelled.", "info");
  });

  it("shows warning when glob matches nothing", async () => {
    const del = vi.fn();
    const kb = makeKB();
    vi.mocked(kb.glob).mockResolvedValue({ entries: [], total: 0 });
    const cmd = createOvDeleteCommand(
      { delete: del } as unknown as FsClient,
      kb,
    );
    const ctx = mockCtx();

    await cmd.handler("viking://resources/temp/*", ctx);

    expect(del).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "No resources match viking://resources/temp/*",
      "warning",
    );
  });
});
