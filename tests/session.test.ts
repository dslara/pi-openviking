import { describe, test, expect, vi, beforeEach } from "vitest";
import type { OpenVikingClient } from "../src/client";
import { SessionSync } from "../src/session";
import { createMockClient } from "./mocks";

import type { AgentMessage } from "@mariozechner/pi-agent-core";

function msg(m: Partial<AgentMessage> & { role: string }): AgentMessage {
  return m as AgentMessage;
}

function createSync(client: OpenVikingClient, opts?: {
  getSessionFile?: () => string | undefined;
  getBranch?: () => any[];
  appendEntry?: (type: string, data: unknown) => void;
}) {
  return new SessionSync(client, {
    getSessionFile: opts?.getSessionFile ?? (() => "/path/to/session.json"),
    getBranch: opts?.getBranch ?? (() => []),
    appendEntry: opts?.appendEntry ?? (() => {}),
  });
}

describe("SessionSync", () => {
  test("onMessageEnd with user text creates session lazily and sends", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    sync.onMessageEnd(msg({
      role: "user",
      content: [{ type: "text", text: "hello world" }],
      timestamp: Date.now(),
    }));

    // Wait for async chain
    await vi.waitFor(() => {
      expect(client.createSession).toHaveBeenCalledOnce();
      expect(client.sendMessage).toHaveBeenCalledWith("ov-sess-1", "user", "hello world");
    });
  });

  test("onMessageEnd with assistant text sends to existing session", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    // First call creates the session
    sync.onMessageEnd(msg({
      role: "user",
      content: [{ type: "text", text: "hello" }],
      timestamp: Date.now(),
    }));
    await vi.waitFor(() => expect(client.createSession).toHaveBeenCalledOnce());

    // Second call reuses session
    sync.onMessageEnd(msg({
      role: "assistant",
      content: [{ type: "text", text: "response text" }],
      timestamp: Date.now(),
    }));
    await vi.waitFor(() => {
      expect(client.createSession).toHaveBeenCalledOnce();
      expect(client.sendMessage).toHaveBeenCalledWith("ov-sess-1", "assistant", "response text");
    });
  });

  test("onMessageEnd skips toolResult role", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    sync.onMessageEnd(msg({
      role: "toolResult",
      content: [{ type: "text", text: "output" }],
      timestamp: Date.now(),
    }));

    // Small delay to ensure nothing fires
    await new Promise((r) => setTimeout(r, 50));
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  test("onMessageEnd skips non-text content (thinking, toolCall, image)", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    sync.onMessageEnd(msg({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hmm" } as any,
        { type: "toolCall", id: "1", name: "bash", arguments: {} } as any,
        { type: "image", data: "abc", mimeType: "image/png" } as any,
      ],
      timestamp: Date.now(),
    }));

    await new Promise((r) => setTimeout(r, 50));
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  test("onMessageEnd skips empty text extraction", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    sync.onMessageEnd(msg({
      role: "user",
      content: [{ type: "text", text: "" }],
      timestamp: Date.now(),
    }));

    await new Promise((r) => setTimeout(r, 50));
    expect(client.createSession).not.toHaveBeenCalled();
  });

  test("onMessageEnd with string content sends directly", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    sync.onMessageEnd(msg({
      role: "user",
      content: "plain string message",
      timestamp: Date.now(),
    }));

    await vi.waitFor(() => {
      expect(client.createSession).toHaveBeenCalledOnce();
      expect(client.sendMessage).toHaveBeenCalledWith("ov-sess-1", "user", "plain string message");
    });
  });

  test("FIFO promise chain preserves message ordering", async () => {
    const order: string[] = [];
    let resolveCreate: () => void;
    const createPromise = new Promise<void>((r) => { resolveCreate = r; });

    const client = createMockClient({
      createSession: vi.fn(async () => {
        await createPromise;
        return "ov-sess-1";
      }),
      sendMessage: vi.fn(async (_sid: string, _role: string, content: string) => {
        order.push(content);
      }),
    });
    const sync = createSync(client);

    sync.onMessageEnd(msg({ role: "user", content: "first", timestamp: Date.now() }));
    sync.onMessageEnd(msg({ role: "assistant", content: [{ type: "text", text: "second" }], timestamp: Date.now() }));
    sync.onMessageEnd(msg({ role: "user", content: "third", timestamp: Date.now() }));

    // All queued but createSession blocks
    expect(order).toEqual([]);

    resolveCreate!();
    await vi.waitFor(() => {
      expect(order).toEqual(["first", "second", "third"]);
    });
  });

  test("appendEntry called to persist ov-session mapping", async () => {
    const client = createMockClient();
    const appendEntry = vi.fn();
    const sync = createSync(client, { appendEntry });

    sync.onMessageEnd(msg({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    }));

    await vi.waitFor(() => {
      expect(appendEntry).toHaveBeenCalledWith("ov-session", { ovSessionId: "ov-sess-1" });
    });
  });

  test("no appendEntry for ephemeral session (getSessionFile returns undefined)", async () => {
    const client = createMockClient();
    const appendEntry = vi.fn();
    const sync = createSync(client, {
      getSessionFile: () => undefined,
      appendEntry,
    });

    sync.onMessageEnd(msg({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    }));

    await vi.waitFor(() => expect(client.createSession).toHaveBeenCalledOnce());
    expect(appendEntry).not.toHaveBeenCalled();
  });

  test("onSessionStart restores ovSessionId from getBranch custom entries", () => {
    const client = createMockClient();
    const sync = createSync(client, {
      getBranch: () => [
        { type: "message", id: "1", parentId: null, timestamp: "", message: {} },
        { type: "custom", customType: "ov-session", data: { ovSessionId: "restored-sess" } },
        { type: "message", id: "0", parentId: null, timestamp: "", message: {} },
      ] as any,
    });

    sync.onSessionStart();

    // Send a message — should NOT call createSession since we restored
    sync.onMessageEnd(msg({
      role: "user",
      content: "test",
      timestamp: Date.now(),
    }));

    // Give microtasks a tick
    return vi.waitFor(() => {
      expect(client.createSession).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith("restored-sess", "user", "test");
    });
  });

  test("onShutdown discards queue and resets session", async () => {
    const client = createMockClient();
    const sync = createSync(client);

    sync.onMessageEnd(msg({ role: "user", content: "before", timestamp: Date.now() }));
    await vi.waitFor(() => expect(client.sendMessage).toHaveBeenCalledOnce());

    sync.onShutdown();

    // After shutdown, new message gets a fresh session
    const createSpy = client.createSession as ReturnType<typeof vi.fn>;
    sync.onMessageEnd(msg({ role: "user", content: "after", timestamp: Date.now() }));
    await vi.waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
  });

  test("onMessageEnd does not crash when OV server is down", async () => {
    const client = createMockClient({
      createSession: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const sync = createSync(client);

    // Should not throw — silently drops the error
    sync.onMessageEnd(msg({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    }));

    await vi.waitFor(() => expect(client.createSession).toHaveBeenCalledOnce());
  });

  test("onMessageEnd does not crash when sendMessage fails", async () => {
    const client = createMockClient({
      sendMessage: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const sync = createSync(client);

    sync.onMessageEnd(msg({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    }));

    await vi.waitFor(() => {
      expect(client.createSession).toHaveBeenCalledOnce();
      expect(client.sendMessage).toHaveBeenCalledOnce();
    });
  });
});
