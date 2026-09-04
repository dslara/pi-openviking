import { describe, it, expect, vi } from "vitest";
import { Uri } from "../../domain/common/uri";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvReindexCommand } from "./ov-reindex-command";
import type { FsClient } from "../../domain/client/open-viking-client";

function makeClient(): FsClient {
  return {
    reindex: vi.fn().mockResolvedValue(undefined),
  } as unknown as FsClient;
}

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

describe("ov-reindex command", () => {
  it("reindexes a URI with default mode", async () => {
    const client = makeClient();
    const cmd = createOvReindexCommand(client);
    const ctx = mockCtx();

    await cmd.handler("viking://resources/test.md", ctx);

    expect(client.reindex).toHaveBeenCalledWith(
      new Uri("viking://resources/test.md"),
      "vectors_only",
      undefined,
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Reindexed"),
      expect.any(String),
    );
  });

  it("passes --mode full flag", async () => {
    const client = makeClient();
    const cmd = createOvReindexCommand(client);
    const ctx = mockCtx();

    await cmd.handler("viking://resources/test.md --mode full", ctx);

    expect(client.reindex).toHaveBeenCalledWith(
      new Uri("viking://resources/test.md"),
      "full",
      undefined,
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("full"),
      expect.any(String),
    );
  });

  it("shows usage when no URI provided", async () => {
    const client = makeClient();
    const cmd = createOvReindexCommand(client);
    const ctx = mockCtx();

    await cmd.handler("", ctx);

    expect(client.reindex).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
      "warning",
    );
  });

  it("validates URI", async () => {
    const client = makeClient();
    const cmd = createOvReindexCommand(client);
    const ctx = mockCtx();

    await cmd.handler("not-a-valid-uri", ctx);

    expect(client.reindex).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Invalid URI"),
      "warning",
    );
  });

  it("handles error", async () => {
    const client = makeClient();
    client.reindex = vi.fn().mockRejectedValue(new Error("OV unreachable"));
    const cmd = createOvReindexCommand(client);
    const ctx = mockCtx();

    await cmd.handler("viking://resources/test.md", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("OV unreachable"),
      "error",
    );
  });
});
