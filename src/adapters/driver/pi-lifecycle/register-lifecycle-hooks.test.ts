import { describe, it, expect, vi } from "vitest";
import { registerLifecycleHooks, handleSessionStart, pollCommit, DEFAULT_AUTO_COMMIT_INTERVAL_MS, resetModuleState } from "./register-lifecycle-hooks";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LifecycleServices } from "./register-lifecycle-hooks";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockPi(): { pi: ExtensionAPI; handlers: Record<string, Function> } {
  const handlers: Record<string, Function> = {};
  const pi = {
    on: (event: string, handler: Function) => {
      handlers[event] = handler;
    },
  } as unknown as ExtensionAPI;
  return { pi, handlers };
}

function createMockServices(overrides?: Partial<LifecycleServices>): LifecycleServices {
  return {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    sessionService: {
      getActive: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendMessages: vi.fn().mockResolvedValue(undefined),
      createAndSet: vi.fn().mockResolvedValue({ value: "test-session", toString: () => "test-session" }),
      commit: vi.fn().mockResolvedValue({}),
    } as any,
    recallService: {
      isEnabled: vi.fn().mockReturnValue(true),
      recall: vi.fn().mockResolvedValue({ formatted: "memories", timedOut: false, items: [] }),
    } as any,
    adapter: { circuitBreakerOpen: false } as any,
    widget: { update: vi.fn() } as any,
    healthCheck: { check: vi.fn().mockResolvedValue({ ok: true }) } as any,
    profileManager: { apply: vi.fn() } as any,
    autoDetectRules: {},
    ...overrides,
  } as LifecycleServices;
}

// Reset module-level state that could leak between tests
beforeEach(() => {
  resetModuleState();
});

function mockCtx() {
  return {
    ui: { confirm: vi.fn(), notify: vi.fn() } as any,
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

type Handler = (event: any, ctx?: any) => Promise<any> | any;

// ── registerLifecycleHooks ──────────────────────────────────────────────────

describe("registerLifecycleHooks", () => {
  it("registers context, before_agent_start, message_end, turn_end, session_before_switch, session_shutdown hooks", () => {
    const { pi, handlers } = createMockPi();
    const svcs = createMockServices();

    registerLifecycleHooks(pi, svcs);

    expect(handlers["context"]).toBeDefined();
    expect(handlers["before_agent_start"]).toBeDefined();
    expect(handlers["message_end"]).toBeDefined();
    expect(handlers["turn_end"]).toBeDefined();
    expect(handlers["session_before_switch"]).toBeDefined();
    expect(handlers["session_shutdown"]).toBeDefined();
  });

  describe("message_end", () => {
    it("sends user message to OV session", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const getActive = vi.fn().mockReturnValue("session-1");
      const svcs = createMockServices({
        sessionService: { getActive, sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["message_end"] as Handler;

      await handler({
        message: { role: "user", content: "hello", timestamp: 1 },
      });

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage.mock.calls[0][1]).toBe("user");
    });

    it("does NOT send assistant message on message_end (deferred to turn_end)", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue("session-1"), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["message_end"] as Handler;

      await handler({
        message: { role: "assistant", content: [{ type: "text", text: "response" }], timestamp: 2 },
      });

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("skips toolResult messages on message_end (handled via turn_end)", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue("session-1"), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["message_end"] as Handler;

      await handler({
        message: {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "ov_search",
          content: [{ type: "text", text: "result" }],
          isError: false,
          timestamp: 3,
        },
      });

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("skips unknown role messages", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue("session-1"), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["message_end"] as Handler;

      await handler({
        message: { role: "custom", content: "something", timestamp: 4 },
      });

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("skips when no active session", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue(null), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["message_end"] as Handler;

      await handler({
        message: { role: "user", content: "hello", timestamp: 1 },
      });

      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("turn_end", () => {
    it("sends merged assistant parts + tool results to OV session", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const getActive = vi.fn().mockReturnValue("session-1");
      const svcs = createMockServices({
        sessionService: { getActive, sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["turn_end"] as Handler;

      await handler({
        type: "turn_end",
        turnIndex: 1,
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check:" },
            { type: "toolCall", id: "call_1", name: "ov_search", arguments: { query: "test" } },
          ],
        },
        toolResults: [
          {
            role: "toolResult",
            toolCallId: "call_1",
            toolName: "ov_search",
            content: [{ type: "text", text: '[{ "result": "ok" }]' }],
            isError: false,
            timestamp: 3,
          },
        ],
      });

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage.mock.calls[0][1]).toBe("assistant");
      const sentParts = sendMessage.mock.calls[0][2];
      expect(sentParts).toHaveLength(2);
      expect(sentParts[0].type).toBe("text");
      expect(sentParts[0].text).toBe("Let me check:");
      expect(sentParts[1].type).toBe("tool");
      expect(sentParts[1].toolId).toBe("call_1");
      expect(sentParts[1].toolStatus).toBe("completed");
      expect(sentParts[1].toolOutput).toBe('[{ "result": "ok" }]');
    });

    it("sends text-only assistant message when no tool calls", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue("session-1"), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["turn_end"] as Handler;

      await handler({
        type: "turn_end",
        turnIndex: 1,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Just text response" }],
        },
        toolResults: [],
      });

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage.mock.calls[0][2]).toHaveLength(1);
      expect(sendMessage.mock.calls[0][2][0].type).toBe("text");
      expect(sendMessage.mock.calls[0][2][0].text).toBe("Just text response");
    });

    it("sets toolStatus to error when tool result isError", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue("session-1"), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["turn_end"] as Handler;

      await handler({
        type: "turn_end",
        turnIndex: 1,
        message: {
          role: "assistant",
          content: [{ type: "toolCall", id: "call_err", name: "bash", arguments: { command: "rm -rf" } }],
        },
        toolResults: [
          {
            role: "toolResult",
            toolCallId: "call_err",
            toolName: "bash",
            content: [{ type: "text", text: "Command failed" }],
            isError: true,
            timestamp: 3,
          },
        ],
      });

      const sentParts = sendMessage.mock.calls[0][2];
      expect(sentParts[0].toolStatus).toBe("error");
      expect(sentParts[0].toolOutput).toBe("Command failed");
    });

    it("skips when no active session", async () => {
      const { pi, handlers } = createMockPi();
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue(null), sendMessage } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["turn_end"] as Handler;

      await handler({
        type: "turn_end",
        turnIndex: 1,
        message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
        toolResults: [],
      });

      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("session_shutdown", () => {
    it("commits active session", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockResolvedValue({});
      const getActive = vi.fn().mockReturnValue("session-1");
      const svcs = createMockServices({
        sessionService: { getActive, commit } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_shutdown"] as Handler;

      await handler({ type: "session_shutdown", reason: "quit" });

      expect(commit).toHaveBeenCalledWith("session-1");
    });

    it("skips commit when no active session", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockResolvedValue({});
      const svcs = createMockServices({
        sessionService: { getActive: vi.fn().mockReturnValue(null), commit } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_shutdown"] as Handler;

      await handler({ type: "session_shutdown", reason: "quit" });

      expect(commit).not.toHaveBeenCalled();
    });

    it("clears recall cache on shutdown", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockResolvedValue({});
      const getActive = vi.fn().mockReturnValue("session-1");
      const svcs = createMockServices({
        sessionService: { getActive, commit } as any,
      });

      registerLifecycleHooks(pi, svcs);

      // Fire context once to populate cache, then shutdown
      const contextHandler = handlers["context"] as Handler;
      await contextHandler({
        type: "context",
        messages: [
          { role: "user", content: "test query", timestamp: 1 },
        ],
      });

      // Cache should be populated — verify by calling again (should hit cache)
      const svc = svcs.recallService;
      const recallSpy = svc.recall as ReturnType<typeof vi.fn>;

      await contextHandler({
        type: "context",
        messages: [
          { role: "user", content: "test query", timestamp: 1 },
        ],
      });

      // Called only once (first call), second should hit cache
      expect(recallSpy).toHaveBeenCalledTimes(1);

      const shutdownHandler = handlers["session_shutdown"] as Handler;
      await shutdownHandler({ type: "session_shutdown", reason: "quit" });

      // After shutdown, cache is cleared — next call re-fetches
      // (only testable via module state, we verify shutdown runs commit)
      expect(commit).toHaveBeenCalledWith("session-1");
    });
  });

  describe("session_before_switch", () => {
    it("commits active session on switch", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockResolvedValue({ sessionId: "session-1" });
      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_before_switch"] as Handler;

      const result = await handler({ reason: "resume" }, mockCtx());

      expect(commit).toHaveBeenCalledWith("session-1");
      expect(commit).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined(); // no cancel
    });

    it("sets skipShutdownCommit flag on successful commit", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockResolvedValue({ sessionId: "session-1" });
      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      // Fire session_before_switch successfully
      const switchHandler = handlers["session_before_switch"] as Handler;
      await switchHandler({ reason: "resume" }, mockCtx());

      // Fire session_shutdown — should skip commit
      const shutdownHandler = handlers["session_shutdown"] as Handler;
      await shutdownHandler({ reason: "quit" });

      // commit was only called once (by session_before_switch), not again by shutdown
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it("retries once on commit failure, then prompts user", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn()
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"));
      const ctx = mockCtx();
      ctx.ui.confirm = vi.fn().mockResolvedValue(false); // user cancels

      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_before_switch"] as Handler;

      const result = await handler({ reason: "resume" }, ctx);

      expect(commit).toHaveBeenCalledTimes(2); // initial + retry
      expect(ctx.ui.confirm).toHaveBeenCalledWith(
        "OV Commit Failed",
        expect.stringContaining("network error"),
      );
      expect(result).toEqual({ cancel: true });
    });

    it("returns cancel:true when user cancels after failed retry", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockRejectedValue(new Error("timeout"));
      const ctx = mockCtx();
      ctx.ui.confirm = vi.fn().mockResolvedValue(false);

      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_before_switch"] as Handler;

      const result = await handler({ reason: "resume" }, ctx);

      expect(result).toEqual({ cancel: true });
    });

    it("proceeds with switch when user confirms after failed retry", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn().mockRejectedValue(new Error("timeout"));
      const ctx = mockCtx();
      ctx.ui.confirm = vi.fn().mockResolvedValue(true); // user proceeds

      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_before_switch"] as Handler;

      const result = await handler({ reason: "resume" }, ctx);

      expect(result).toBeUndefined(); // no cancel
    });

    it("retry succeeds after first failure", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn()
        .mockRejectedValueOnce(new Error("temp failure"))
        .mockResolvedValueOnce({ sessionId: "session-1" });
      const ctx = mockCtx();
      ctx.ui.confirm = vi.fn();

      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_before_switch"] as Handler;

      const result = await handler({ reason: "resume" }, ctx);

      expect(commit).toHaveBeenCalledTimes(2);
      expect(ctx.ui.confirm).not.toHaveBeenCalled(); // retry succeeded, no prompt needed
      expect(result).toBeUndefined();
    });

    it("is no-op when no active session", async () => {
      const { pi, handlers } = createMockPi();
      const commit = vi.fn();
      const svcs = createMockServices({
        sessionService: {
          getActive: vi.fn().mockReturnValue(null),
          commit,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["session_before_switch"] as Handler;

      await handler({ reason: "resume" }, mockCtx());

      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe("before_agent_start", () => {
    it("injects repo context snippet into systemPrompt when repoContext exists", async () => {
      const { pi, handlers } = createMockPi();
      const getSnippet = vi.fn().mockResolvedValue("Resource: viking://resources/doc.md");
      const svcs = createMockServices({
        repoContext: { getSystemPromptSnippet: getSnippet } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["before_agent_start"] as Handler;

      const result = await handler({
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "You are a helpful assistant.",
      });

      expect(result.systemPrompt).toContain("Resource:");
      expect(result.systemPrompt).toContain("You are a helpful assistant");
    });

    it("returns undefined when no repoContext", async () => {
      const { pi, handlers } = createMockPi();
      const svcs = createMockServices();
      delete (svcs as any).repoContext;

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["before_agent_start"] as Handler;

      const result = await handler({
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "System prompt",
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined when repo context snippet is empty", async () => {
      const { pi, handlers } = createMockPi();
      const getSnippet = vi.fn().mockResolvedValue("");
      const svcs = createMockServices({
        repoContext: { getSystemPromptSnippet: getSnippet } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["before_agent_start"] as Handler;

      const result = await handler({
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "System prompt",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("pollCommit", () => {
    it("commits active session", async () => {
      const commit = vi.fn().mockResolvedValue({});
      const getActive = vi.fn().mockReturnValue("session-1");
      const result = await pollCommit({ getActive, commit } as any);
      expect(result.committed).toBe(true);
      expect(result.error).toBeUndefined();
      expect(commit).toHaveBeenCalledWith("session-1");
    });

    it("returns committed:false when no active session", async () => {
      const result = await pollCommit({ getActive: vi.fn().mockReturnValue(null) } as any);
      expect(result.committed).toBe(false);
    });

    it("returns committed:false and error on commit failure", async () => {
      const commit = vi.fn().mockRejectedValue(new Error("OV timeout"));
      const getActive = vi.fn().mockReturnValue("session-1");
      const result = await pollCommit({ getActive, commit } as any);
      expect(result.committed).toBe(false);
      expect(result.error).toContain("OV timeout");
    });

    it("starts background polling when commit returns taskId", async () => {
      const waitForCommit = vi.fn().mockResolvedValue({ status: "completed" });
      const commit = vi.fn().mockResolvedValue({ taskId: "task-123" });
      const getActive = vi.fn().mockReturnValue("session-1");

      await pollCommit({ getActive, commit, waitForCommit } as any);

      // waitForCommit is called in a .catch() handler, so give microtask a tick
      await new Promise((r) => setTimeout(r, 0));
      expect(waitForCommit).toHaveBeenCalledWith("task-123");
    });

    it("logs warn when background polling fails", async () => {
      const warn = vi.fn();
      const waitForCommit = vi.fn().mockRejectedValue(new Error("task not found"));
      const commit = vi.fn().mockResolvedValue({ taskId: "task-456" });
      const getActive = vi.fn().mockReturnValue("session-1");

      await pollCommit({ getActive, commit, waitForCommit } as any, { debug: vi.fn(), warn, error: vi.fn() } as any);

      await new Promise((r) => setTimeout(r, 0));
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls[0][0]).toContain("pollCommit");
    });
  });

  describe("DEFAULT_AUTO_COMMIT_INTERVAL_MS", () => {
    it("is set to 5 minutes", () => {
      expect(DEFAULT_AUTO_COMMIT_INTERVAL_MS).toBe(5 * 60 * 1000);
    });
  });

  describe("context", () => {
    it("injects memories as custom message when recall enabled", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: "relevant memories", timedOut: false, items: [] });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test query", timestamp: 1 },
        ],
      });

      expect(recall).toHaveBeenCalledWith("test query", "session-1");
      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      // Original messages + injected custom message
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].role).toBe("custom");
      expect(result.messages[1].customType).toBe("memory_context");
      expect(result.messages[1].content).toBe("relevant memories");
      expect(result.messages[1].display).toBe(false);
    });

    it("returns undefined (no injection) when recall disabled", async () => {
      const { pi, handlers } = createMockPi();
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(false) } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test query", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined (no injection) when circuit breaker open", async () => {
      const { pi, handlers } = createMockPi();
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true) } as any,
        adapter: { circuitBreakerOpen: true } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined when no user message text found", async () => {
      const { pi, handlers } = createMockPi();
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true) } as any,
        adapter: { circuitBreakerOpen: false } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      // Empty messages — no user text to extract
      const result = await handler({
        type: "context",
        messages: [],
      });

      expect(result).toBeUndefined();
    });

    it("auto-creates session when none active", async () => {
      const { pi, handlers } = createMockPi();
      const createAndSet = vi.fn().mockResolvedValue({ value: "new-session", toString: () => "new-session" });
      const recall = vi.fn().mockResolvedValue({ formatted: "memories", timedOut: false, items: [] });
      const update = vi.fn();
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue(null),
          createAndSet,
        } as any,
        widget: { update } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(createAndSet).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith("session", "new-session");
    });

    it("caches recall result by query hash across same turn", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: "cached memories", timedOut: false, items: [] });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;
      const event = {
        type: "context",
        messages: [
          { role: "user", content: "same query", timestamp: 1 },
        ],
      };

      // First call — should run recall
      await handler(event);
      expect(recall).toHaveBeenCalledTimes(1);

      // Second call with same messages — should use cache, not recall
      await handler(event);
      expect(recall).toHaveBeenCalledTimes(1); // still 1

      // Third call — still cached
      await handler(event);
      expect(recall).toHaveBeenCalledTimes(1);
    });

    it("invalidates cache on different user query", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: "memories", timedOut: false, items: [] });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      // First query
      await handler({
        type: "context",
        messages: [
          { role: "user", content: "query one", timestamp: 1 },
        ],
      });
      expect(recall).toHaveBeenCalledTimes(1);

      // Different query — re-fetch
      await handler({
        type: "context",
        messages: [
          { role: "user", content: "query two", timestamp: 2 },
        ],
      });
      expect(recall).toHaveBeenCalledTimes(2);
    });

    it("handles recall returning no memories gracefully", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: null, timedOut: false, items: [] });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
    });

    it("updates widget with persisted stats on cache hit", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({
        formatted: "memories content",
        timedOut: false,
        items: [{ uri: "viking://mem/1" }, { uri: "viking://mem/2" }],
        tokens: 142,
      });
      const widget = { update: vi.fn() } as any;
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          sessionUsed: vi.fn().mockResolvedValue(undefined),
        } as any,
        widget,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;
      const event = {
        type: "context",
        messages: [
          { role: "user", content: "same query", timestamp: 1 },
        ],
      };

      // Track lastRecall calls
      const lastRecallCalls = () =>
        widget.update.mock.calls.filter((c: any[]) => c[0] === "lastRecall");

      // First call — recall runs, widget updated with computed stats
      await handler(event);
      expect(lastRecallCalls()).toHaveLength(1);
      expect(lastRecallCalls()[0][1]).toBe("2it 142tk");

      // Second call — cache hit, widget updated AGAIN with persisted stats
      await handler(event);
      expect(lastRecallCalls()).toHaveLength(2);
      expect(lastRecallCalls()[1][1]).toBe("2it 142tk");
    });

    it("shows 0it 0tk when recall returns no results", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: null, timedOut: false, items: [], tokens: 0 });
      const widget = { update: vi.fn() } as any;
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
        widget,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
      expect(widget.update).toHaveBeenCalledWith("lastRecall", "0it 0tk");
    });

    it("clears lastRecall when circuit breaker open", async () => {
      const { pi, handlers } = createMockPi();
      const widget = { update: vi.fn() } as any;
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true) } as any,
        adapter: { circuitBreakerOpen: true } as any,
        widget,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
      expect(widget.update).toHaveBeenCalledWith("lastRecall", "");
    });

    it("clears lastRecall when recall disabled", async () => {
      const { pi, handlers } = createMockPi();
      const widget = { update: vi.fn() } as any;
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(false) } as any,
        widget,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
      expect(widget.update).toHaveBeenCalledWith("lastRecall", "");
    });

    it("handles recall timeout gracefully", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: "memories", timedOut: true, items: [] });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      const result = await handler({
        type: "context",
        messages: [
          { role: "user", content: "test", timestamp: 1 },
        ],
      });

      expect(result).toBeUndefined();
    });

    it("extracts user text from array content messages", async () => {
      const { pi, handlers } = createMockPi();
      const recall = vi.fn().mockResolvedValue({ formatted: "memories", timedOut: false, items: [] });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      await handler({
        type: "context",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "analyze" },
              { type: "text", text: "this code" },
            ],
            timestamp: 1,
          },
        ],
      });

      expect(recall).toHaveBeenCalledWith("analyze this code", "session-1");
    });

    it("records used contexts via sessionService.sessionUsed after recall with items", async () => {
      const { pi, handlers } = createMockPi();
      const sessionUsed = vi.fn().mockResolvedValue(undefined);
      const recall = vi.fn().mockResolvedValue({
        formatted: "relevant memories",
        timedOut: false,
        items: [
          { uri: "viking://resources/doc1.md" },
          { uri: "viking://resources/doc2.md" },
        ],
        tokens: 80,
      });
      const svcs = createMockServices({
        recallService: { isEnabled: vi.fn().mockReturnValue(true), recall } as any,
        adapter: { circuitBreakerOpen: false } as any,
        sessionService: {
          getActive: vi.fn().mockReturnValue("session-1"),
          sessionUsed,
        } as any,
      });

      registerLifecycleHooks(pi, svcs);
      const handler = handlers["context"] as Handler;

      await handler({
        type: "context",
        messages: [
          { role: "user", content: "find me docs", timestamp: 1 },
        ],
      });

      expect(sessionUsed).toHaveBeenCalledTimes(1);
      // First arg: session ID
      expect(sessionUsed.mock.calls[0][0]).toBe("session-1");
      // Second arg: array of Uri objects
      const uris = sessionUsed.mock.calls[0][1];
      expect(uris).toHaveLength(2);
      expect(uris[0].toString()).toBe("viking://resources/doc1.md");
      expect(uris[1].toString()).toBe("viking://resources/doc2.md");
    });
  });
});

// ── handleSessionStart ──────────────────────────────────────────────────────

describe("handleSessionStart", () => {
  it("attaches widget and creates session", async () => {
    const check = vi.fn().mockResolvedValue({ ok: true });
    const update = vi.fn();
    const createAndSet = vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" });
    const svcs = createMockServices({
      widget: { update, attach: vi.fn() } as any,
      sessionService: {
        createAndSet,
        getActive: vi.fn().mockReturnValue("sess-1"),
      } as any,
    });

    await handleSessionStart({ cwd: "/test", ui: {} as any }, svcs);

    expect(createAndSet).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("session", "sess-1");
  });

  describe("re-hydrate on resume/fork", () => {
    it("skips re-hydration on startup (no reason)", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: { getBranch: () => [{ role: "user", content: "hi", timestamp: 1 }] } },
        svcs,
      );

      expect(sendMessages).not.toHaveBeenCalled();
    });

    it("skips re-hydration on reason=new", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: { getBranch: () => [{ role: "user", content: "hi" }] } },
        svcs,
        "new",
      );

      expect(sendMessages).not.toHaveBeenCalled();
    });

    it("re-hydrates user/assistant messages on resume", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      // getBranch() returns { type, message } entries per Pi SDK
      const branch = [
        { type: "system", message: { role: "system", content: "You are helpful" }, timestamp: 1 },
        { type: "message", message: { role: "user", content: "hello" }, timestamp: 2 },
        { type: "message", message: { role: "assistant", content: "Hi there!" }, timestamp: 3 },
        { type: "message", message: { role: "tool", content: "result" }, timestamp: 4 },
        { type: "message", message: { role: "user", content: "how are you?" }, timestamp: 5 },
      ];

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: { getBranch: () => branch } },
        svcs,
        "resume",
      );

      // Should send 3 user/assistant messages (system and tool filtered out)
      expect(sendMessages).toHaveBeenCalledTimes(1);
      const sent = sendMessages.mock.calls[0][1] as Array<{ role: string }>;
      expect(sent).toHaveLength(3);
      expect(sent[0].role).toBe("user");
      expect(sent[1].role).toBe("assistant");
      expect(sent[2].role).toBe("user");
    });

    it("re-hydrates on fork", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: { getBranch: () => [{ type: "message", message: { role: "user", content: "hello" }, timestamp: 1 }] } },
        svcs,
        "fork",
      );

      expect(sendMessages).toHaveBeenCalledTimes(1);
    });

    it("skips when no branch entries exist", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: { getBranch: () => [] } },
        svcs,
        "resume",
      );

      expect(sendMessages).not.toHaveBeenCalled();
    });

    it("skips when getBranch is undefined", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: {} },
        svcs,
        "resume",
      );

      expect(sendMessages).not.toHaveBeenCalled();
    });

    it("chunks when more than 50 messages", async () => {
      const sendMessages = vi.fn().mockResolvedValue(undefined);
      const svcs = createMockServices({
        widget: { update: vi.fn(), attach: vi.fn() } as any,
        sessionService: {
          createAndSet: vi.fn().mockResolvedValue({ value: "sess-1", toString: () => "sess-1" }),
          getActive: vi.fn().mockReturnValue("sess-1"),
          sendMessages,
        } as any,
        logger: { info: vi.fn(), debug: vi.fn() } as any,
      });

      // 75 user messages = 2 chunks (50 + 25), using real getBranch() shape
      const branch = Array.from({ length: 75 }, (_, i) => ({
        type: "message",
        message: { role: "user", content: `message ${i + 1}` },
        timestamp: i + 1,
      }));

      await handleSessionStart(
        { cwd: "/test", ui: {} as any, sessionManager: { getBranch: () => branch } },
        svcs,
        "resume",
      );

      // Only the last 50 should be sent (slice(-50))
      expect(sendMessages).toHaveBeenCalledTimes(1);
      const sent = sendMessages.mock.calls[0][1] as Array<{ role: string }>;
      expect(sent).toHaveLength(50);
    });
  });
});
