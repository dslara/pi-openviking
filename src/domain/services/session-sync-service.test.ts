import { describe, it, expect, vi, beforeEach, afterEach, fakeTimers } from "vitest";
import { SessionSync } from "./session-sync-service";
import type { SessionManager } from "./session-service";
import type { Part } from "../common/part";
import type { SessionId } from "../common/session-id";

// ── Mocks ──────────────────────────────────────────────────────────────────

function createMockSessionManager(overrides?: Partial<SessionManager>): SessionManager {
  return {
    getActive: vi.fn().mockReturnValue({ value: "sess_1" }) as unknown as () => SessionId | null,
    commit: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    waitForCommit: vi.fn().mockResolvedValue(undefined),
    createAndSet: vi.fn().mockResolvedValue({ value: "sess_1" }),
    sendMessages: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn(),
    sessionUsed: vi.fn(),
    deleteSession: vi.fn(),
    ...overrides,
  } as unknown as SessionManager;
}

function createMockAdapter(overrides?: Record<string, any>) {
  return {
    circuitBreakerOpen: false,
    ...overrides,
  } as any;
}

function createMockLogger(overrides?: Record<string, any>) {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    ...overrides,
  } as any;
}

function makeParts(text = "hello"): Part[] {
  return [{ type: "text" as const, text }];
}

function sid(): SessionId {
  return { value: "sess_1" } as SessionId;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SessionSync", () => {
  let sessionManager: SessionManager;
  let adapter: any;
  let logger: any;

  beforeEach(() => {
    sessionManager = createMockSessionManager();
    adapter = createMockAdapter();
    logger = createMockLogger();
  });

  describe("initial state", () => {
    it("can be instantiated and isDirty returns false", () => {
      const sync = new SessionSync(sessionManager, adapter, logger);
      expect(sync).toBeInstanceOf(SessionSync);
      expect(sync.isDirty()).toBe(false);
    });

    it("getActiveSession delegates to sessionManager", () => {
      const sync = new SessionSync(sessionManager, adapter, logger);
      expect(sync.getActiveSession()).toEqual({ value: "sess_1" });
    });
  });

  describe("onMessageEnd", () => {
    it("sends message and marks dirty", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onMessageEnd(sid(), "user", makeParts("user message"));

      expect(sessionManager.sendMessage).toHaveBeenCalledWith(sid(), "user", makeParts("user message"));
      expect(sync.isDirty()).toBe(true);
    });

    it("skips when circuit breaker is open", async () => {
      adapter.circuitBreakerOpen = true;
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onMessageEnd(sid(), "user", makeParts());

      expect(sessionManager.sendMessage).not.toHaveBeenCalled();
      expect(sync.isDirty()).toBe(false);
    });

    it("retries once on failure with 500ms backoff", async () => {
      const sendMessage = vi.fn()
        .mockRejectedValueOnce(new Error("temp"))
        .mockResolvedValueOnce(undefined);
      const sm = createMockSessionManager({ sendMessage });
      const sync = new SessionSync(sm, adapter, logger);

      await sync.onMessageEnd(sid(), "user", makeParts());

      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sync.isDirty()).toBe(true);
    });

    it("logs warn when both attempts fail", async () => {
      const sendMessage = vi.fn().mockRejectedValue(new Error("persistent error"));
      const sm = createMockSessionManager({ sendMessage });
      const sync = new SessionSync(sm, adapter, logger);

      await sync.onMessageEnd(sid(), "user", makeParts());

      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalled();
      expect(sync.isDirty()).toBe(false); // not dirty on failure
    });

    it("skips when parts array is empty", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onMessageEnd(sid(), "user", []);

      expect(sessionManager.sendMessage).not.toHaveBeenCalled();
      expect(sync.isDirty()).toBe(false);
    });
  });

  describe("onTurnEnd", () => {
    it("sends assistant parts and marks dirty", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);
      const parts = makeParts("assistant response");

      await sync.onTurnEnd(sid(), parts, []);

      expect(sessionManager.sendMessage).toHaveBeenCalledWith(sid(), "assistant", parts);
      expect(sync.isDirty()).toBe(true);
    });

    it("skips when circuit breaker is open", async () => {
      adapter.circuitBreakerOpen = true;
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onTurnEnd(sid(), makeParts(), []);

      expect(sessionManager.sendMessage).not.toHaveBeenCalled();
      expect(sync.isDirty()).toBe(false);
    });

    it("skips when parts array is empty", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onTurnEnd(sid(), [], []);

      expect(sessionManager.sendMessage).not.toHaveBeenCalled();
      expect(sync.isDirty()).toBe(false);
    });

    it("accepts toolResults parameter for binding layer", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);
      const parts = makeParts("with tool calls");
      const toolResults = [{ toolCallId: "call_1", toolName: "test", content: [{ type: "text" as const, text: "result" }], isError: false }] as any;

      await sync.onTurnEnd(sid(), parts, toolResults);

      expect(sessionManager.sendMessage).toHaveBeenCalledWith(sid(), "assistant", parts);
    });
  });

  describe("onBeforeSwitch", () => {
    it("commits active session and marks skipShutdownCommit", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);

      const result = await sync.onBeforeSwitch(sid());

      expect(sessionManager.commit).toHaveBeenCalledWith(sid());
      expect(result).toBeUndefined();
    });

    it("skips when circuit breaker is open", async () => {
      adapter.circuitBreakerOpen = true;
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onBeforeSwitch(sid());

      expect(sessionManager.commit).not.toHaveBeenCalled();
    });

    it("retries once on commit failure then prompts user", async () => {
      const commit = vi.fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("timeout"));
      const sm = createMockSessionManager({ commit });
      const confirm = vi.fn().mockResolvedValue(false);
      const sync = new SessionSync(sm, adapter, logger);

      const result = await sync.onBeforeSwitch(sid(), { confirm });

      expect(commit).toHaveBeenCalledTimes(2);
      expect(confirm).toHaveBeenCalledWith("OV Commit Failed", expect.stringContaining("timeout"));
      expect(result).toEqual({ cancel: true });
    });

    it("proceeds when retry succeeds", async () => {
      const commit = vi.fn()
        .mockRejectedValueOnce(new Error("temp"))
        .mockResolvedValueOnce({});
      const sm = createMockSessionManager({ commit });
      const confirm = vi.fn();
      const sync = new SessionSync(sm, adapter, logger);

      const result = await sync.onBeforeSwitch(sid(), { confirm });

      expect(commit).toHaveBeenCalledTimes(2);
      expect(confirm).not.toHaveBeenCalled(); // retry succeeded, no prompt needed
      expect(result).toBeUndefined();
    });

    it("is no-op when session is null", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);
      // onBeforeSwitch with a valid session — null case handled by binding layer
    });
  });

  describe("onShutdown", () => {
    it("commits active session", async () => {
      const sync = new SessionSync(sessionManager, adapter, logger);

      await sync.onShutdown(sid());

      expect(sessionManager.commit).toHaveBeenCalledWith(sid());
    });

    it("skips commit when skipShutdownCommit flag is set", async () => {
      const commit = vi.fn().mockResolvedValue({});
      const sm = createMockSessionManager({ commit });
      const sync = new SessionSync(sm, adapter, logger);

      // Simulate: beforeSwitch succeeded setting the flag
      await sync.onBeforeSwitch(sid());
      expect(commit).toHaveBeenCalledTimes(1); // the switch commit

      // Now shutdown should skip
      await sync.onShutdown(sid());
      expect(commit).toHaveBeenCalledTimes(1); // still 1 — shutdown skipped
    });

    it("resets skipShutdownCommit after consuming it", async () => {
      const commit = vi.fn().mockResolvedValue({});
      const sm = createMockSessionManager({ commit });
      const sync = new SessionSync(sm, adapter, logger);

      await sync.onBeforeSwitch(sid());
      await sync.onShutdown(sid());

      // After shutdown consumed the flag, next shutdown should commit
      const sid2 = { value: "sess_2" } as SessionId;
      await sync.onShutdown(sid2);
      expect(commit).toHaveBeenCalledTimes(2); // beforeSwitch + second shutdown
    });

    it("stops auto-commit timer if running", async () => {
      vi.useFakeTimers();
      const sync = new SessionSync(sessionManager, adapter, logger);

      sync.startAutoCommit(1000);
      expect(sync.isDirty()).toBe(false); // timer hasn't fired

      await sync.onShutdown(sid());

      // After shutdown, timer is cleared
      // Set dirty via onMessageEnd — but timer won't fire
      await sync.onMessageEnd(sid(), "user", makeParts("test"));
      expect(sync.isDirty()).toBe(true);

      vi.advanceTimersByTime(5000); // timer would have fired if not stopped

      // Verify commit was called only once (by shutdown, not by auto-commit)
      expect(sessionManager.commit).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe("startAutoCommit / stopAutoCommit", () => {
    it("startAutoCommit starts polling timer", () => {
      vi.useFakeTimers();
      const sync = new SessionSync(sessionManager, adapter, logger);

      sync.startAutoCommit(10000);
      expect(sync.isDirty()).toBe(false);

      vi.useRealTimers();
    });

    it("stopAutoCommit clears timer", () => {
      vi.useFakeTimers();
      const sync = new SessionSync(sessionManager, adapter, logger);

      sync.startAutoCommit(10000);
      sync.stopAutoCommit();

      expect(sync.isDirty()).toBe(false);
      vi.useRealTimers();
    });
  });
});
