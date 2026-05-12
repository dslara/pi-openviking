import { describe, test, expect, vi } from "vitest";
import { registerCommands } from "../src/commands/register";
import { createMockClient, createMockSessionSync } from "./mocks";

function createMockPi() {
  const commands: Record<string, { description?: string; handler: (...args: any[]) => any }> = {};
  const messages: any[] = [];

  return {
    registerCommand: vi.fn((name: string, options: { description?: string; handler: (...args: any[]) => any }) => {
      commands[name] = options;
    }),
    sendMessage: vi.fn((msg: any, opts?: any) => {
      messages.push({ msg, opts });
    }),
    getCommand: (name: string) => commands[name],
    getMessages: () => messages,
  };
}

function createMockCmdCtx() {
  return {
    ui: { notify: vi.fn() },
    hasUI: true,
  };
}

function makeDeps(overrides?: {
  client?: ReturnType<typeof createMockClient>;
  sessionSync?: ReturnType<typeof createMockSessionSync>;
  autoRecallState?: { enabled: boolean };
}) {
  const pi = createMockPi();
  const client = overrides?.client ?? createMockClient();
  const sessionSync = overrides?.sessionSync ?? createMockSessionSync();
  const autoRecallState = overrides?.autoRecallState ?? { enabled: true };

  registerCommands({ pi: pi as any, client, sessionSync, autoRecallState });

  return { pi, client, sessionSync, autoRecallState };
}

describe("registerCommands", () => {
  test("registers 6 commands", () => {
    const { pi } = makeDeps();
    expect(pi.registerCommand).toHaveBeenCalledTimes(6);
    expect(pi.getCommand("ov-search")).toBeDefined();
    expect(pi.getCommand("ov-ls")).toBeDefined();
    expect(pi.getCommand("ov-import")).toBeDefined();
    expect(pi.getCommand("ov-delete")).toBeDefined();
    expect(pi.getCommand("ov-recall")).toBeDefined();
    expect(pi.getCommand("ov-commit")).toBeDefined();
  });

  describe("/ov-search", () => {
    test("searches and injects message", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-search");
      const ctx = createMockCmdCtx();

      await cmd.handler("how does auth work", ctx);
      expect(client.search).toHaveBeenCalledWith("ov-sess-1", "how does auth work", 10, "fast", undefined, undefined);
      expect(pi.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ customType: "ov-search", display: true }),
        expect.objectContaining({ triggerTurn: true, deliverAs: "steer" }),
      );
    });

    test("parses flags", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-search");
      const ctx = createMockCmdCtx();

      await cmd.handler("--deep --limit 20 --uri viking://docs auth flow", ctx);
      expect(client.search).toHaveBeenCalledWith("ov-sess-1", "auth flow", 20, "deep", "viking://docs", undefined);
    });

    test("notifies on missing query", async () => {
      const { pi } = makeDeps();
      const cmd = pi.getCommand("ov-search");
      const ctx = createMockCmdCtx();

      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage:"), "error");
      expect(pi.sendMessage).not.toHaveBeenCalled();
    });

    test("notifies on error", async () => {
      const client = createMockClient({
        search: vi.fn(async () => { throw new Error("search boom"); }),
      });
      const { pi } = makeDeps({ client });
      const cmd = pi.getCommand("ov-search");
      const ctx = createMockCmdCtx();

      await cmd.handler("hello", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith("✗ Search failed: search boom", "error");
    });
  });

  describe("/ov-ls", () => {
    test("lists and injects message", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-ls");
      const ctx = createMockCmdCtx();

      await cmd.handler("viking://resources", ctx);
      expect(client.fsList).toHaveBeenCalledWith("viking://resources", undefined, false, false);
      expect(pi.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ customType: "ov-ls", display: true }),
        expect.objectContaining({ triggerTurn: true, deliverAs: "steer" }),
      );
    });

    test("uses tree flag", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-ls");
      const ctx = createMockCmdCtx();

      await cmd.handler("--tree viking://resources", ctx);
      expect(client.fsTree).toHaveBeenCalledWith("viking://resources", undefined);
    });

    test("uses stat flag", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-ls");
      const ctx = createMockCmdCtx();

      await cmd.handler("--stat viking://resources/file.md", ctx);
      expect(client.fsStat).toHaveBeenCalledWith("viking://resources/file.md", undefined);
    });

    test("defaults to viking://", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-ls");
      const ctx = createMockCmdCtx();

      await cmd.handler("", ctx);
      expect(client.fsList).toHaveBeenCalledWith("viking://", undefined, false, false);
    });
  });

  describe("/ov-import", () => {
    test("imports URL and notifies", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-import");
      const ctx = createMockCmdCtx();

      await cmd.handler("https://example.com/docs", ctx);
      expect(client.addResource).toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("✓ Imported:"), "info");
    });

    test("notifies on missing source", async () => {
      const { pi } = makeDeps();
      const cmd = pi.getCommand("ov-import");
      const ctx = createMockCmdCtx();

      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage:"), "error");
    });
  });

  describe("/ov-delete", () => {
    test("deletes and notifies", async () => {
      const { pi, client } = makeDeps();
      const cmd = pi.getCommand("ov-delete");
      const ctx = createMockCmdCtx();

      await cmd.handler("viking://resources/old", ctx);
      expect(client.delete).toHaveBeenCalledWith("viking://resources/old", undefined);
      expect(ctx.ui.notify).toHaveBeenCalledWith("✓ Deleted: viking://resources/old", "info");
    });

    test("notifies on missing uri", async () => {
      const { pi } = makeDeps();
      const cmd = pi.getCommand("ov-delete");
      const ctx = createMockCmdCtx();

      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage:"), "error");
    });
  });

  describe("/ov-recall", () => {
    test("toggles state", async () => {
      const { autoRecallState } = makeDeps({ autoRecallState: { enabled: true } });
      const pi = createMockPi();
      registerCommands({ pi: pi as any, client: createMockClient(), sessionSync: createMockSessionSync(), autoRecallState });
      const cmd = pi.getCommand("ov-recall");
      const ctx = createMockCmdCtx();

      expect(autoRecallState.enabled).toBe(true);
      await cmd.handler("", ctx);
      expect(autoRecallState.enabled).toBe(false);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("disabled"), "info");
    });

    test("shows status", async () => {
      const { autoRecallState } = makeDeps({ autoRecallState: { enabled: false } });
      const pi = createMockPi();
      registerCommands({ pi: pi as any, client: createMockClient(), sessionSync: createMockSessionSync(), autoRecallState });
      const cmd = pi.getCommand("ov-recall");
      const ctx = createMockCmdCtx();

      await cmd.handler("--status", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("disabled"), "info");
    });
  });

  describe("/ov-commit", () => {
    test("commits and notifies success", async () => {
      const sessionSync = createMockSessionSync();
      const { pi } = makeDeps({ sessionSync });
      const cmd = pi.getCommand("ov-commit");
      const ctx = createMockCmdCtx();

      await cmd.handler("", ctx);
      expect(sessionSync.flush).toHaveBeenCalled();
      expect(sessionSync.commit).toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("✓ Session committed. Task:"), "info");
    });

    test("notifies error", async () => {
      const sessionSync = createMockSessionSync({
        commit: vi.fn(async () => { throw new Error("no session"); }),
      });
      const { pi } = makeDeps({ sessionSync });
      const cmd = pi.getCommand("ov-commit");
      const ctx = createMockCmdCtx();

      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith("✗ Commit failed: no session", "error");
    });
  });
});
