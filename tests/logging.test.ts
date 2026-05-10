import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenVikingClient } from "../src/client";
import type { OpenVikingConfig } from "../src/config";
import { SessionSync } from "../src/session";

function testConfig(): OpenVikingConfig {
  return {
    endpoint: "http://localhost",
    timeout: 5000,
    commitTimeout: 60000,
    apiKey: "key",
    account: "acc",
    user: "u",
    autoRecallLimit: 10,
    autoRecallTimeout: 5000,
    autoRecallTopN: 5,
    openVikingAutoRecall: true,
    autoRecallScoreThreshold: 0.15,
    autoRecallMaxContentChars: 500,
    autoRecallPreferAbstract: true,
    autoRecallTokenBudget: 500,
  };
}

function mockClient(overrides?: Partial<OpenVikingClient>): OpenVikingClient {
  return {
    createSession: vi.fn().mockResolvedValue("sess-123"),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ memories: [], resources: [], skills: [], total: 0 }),
    read: vi.fn().mockResolvedValue({ content: "" }),
    fsList: vi.fn().mockResolvedValue({ uri: "", children: [] }),
    fsTree: vi.fn().mockResolvedValue({ uri: "", children: [] }),
    fsStat: vi.fn().mockResolvedValue({ uri: "", children: [] }),
    commit: vi.fn().mockResolvedValue({ task_id: "t1", archived: true }),
    delete: vi.fn().mockResolvedValue({ uri: "" }),
    addResource: vi.fn().mockResolvedValue({ root_uri: "", status: "", errors: [] }),
    tempUpload: vi.fn().mockResolvedValue({ temp_file_id: "" }),
    ...overrides,
  };
}

function mockOpts() {
  return {
    getSessionFile: vi.fn().mockReturnValue(undefined),
    getBranch: vi.fn().mockReturnValue([]),
    appendEntry: vi.fn(),
  };
}

function makeMessage(role: "user" | "assistant", text: string) {
  return {
    role,
    content: [{ type: "text", text }],
  } as any;
}

describe("Logging", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("Session Sync: error catch logs", () => {
    it("logs error when createSession throws", async () => {
      const client = mockClient({
        createSession: vi.fn().mockRejectedValue(new Error("connection refused")),
      });
      const sync = new SessionSync(client, mockOpts());

      sync.onMessageEnd(makeMessage("user", "hello"));
      await sync.flush();

      expect(errorSpy).toHaveBeenCalledWith("[ov] message send failed:", "connection refused");
    });

    it("logs error when sendMessage throws", async () => {
      const client = mockClient();
      (client.createSession as ReturnType<typeof vi.fn>).mockResolvedValue("sess-err");
      (client.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
      const sync = new SessionSync(client, mockOpts());

      sync.onMessageEnd(makeMessage("user", "hello"));
      await sync.flush();

      expect(errorSpy).toHaveBeenCalledWith("[ov] message send failed:", "timeout");
    });
  });

  describe("Session Sync: message send", () => {
    it("logs message send with role and content length", async () => {
      const client = mockClient();
      const sync = new SessionSync(client, mockOpts());

      sync.onMessageEnd(makeMessage("user", "hello world"));
      await sync.flush();

      expect(debugSpy).toHaveBeenCalledWith("[ov] message sent:", "user", 11);
    });
  });

  describe("No console.log usage", () => {
    it("uses only console.debug and console.error in source files", async () => {
      const { readdir, readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const srcDir = join(import.meta.dirname, "..", "src");
      const files = await readdir(srcDir, { recursive: true });
      const tsFiles = files.filter((f: string) => f.endsWith(".ts"));

      const violations: string[] = [];
      for (const f of tsFiles) {
        const content = await readFile(join(srcDir, f), "utf-8");
        // Match console.log but not console.debug or console.error
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (/console\.log(?!ger|ic)/.test(lines[i])) {
            violations.push(`${f}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it("all console calls use [ov] prefix", async () => {
      const { readdir, readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const srcDir = join(import.meta.dirname, "..", "src");
      const files = await readdir(srcDir, { recursive: true });
      const tsFiles = files.filter((f: string) => f.endsWith(".ts"));

      const violations: string[] = [];
      for (const f of tsFiles) {
        const content = await readFile(join(srcDir, f), "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/console\.(debug|error)\(/);
          if (match && !/"\[ov\]/.test(lines[i])) {
            violations.push(`${f}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("Tools: memsearch error logs", () => {
    it("logs error when search fails", async () => {
      const client = mockClient({
        search: vi.fn().mockRejectedValue(new Error("server down")),
      });
      const sync = { getOvSessionId: () => undefined } as any;
      const { registerMemsearchTool } = await import("../src/tools");

      const pi = {
        registerTool: vi.fn(),
      } as any;
      registerMemsearchTool(pi, client, sync);

      // Extract the execute handler from registerTool call
      const call = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls[0];
      const execute = call[0].execute;

      const result = await execute("tc-1", { query: "test" }, undefined, undefined, {});

      expect(errorSpy).toHaveBeenCalledWith("[ov] search failed:", "server down");
    });
  });

  describe("Client Adapter: commit", () => {
    it("logs commit call and result", async () => {
      const { createClient } = await import("../src/client");
      const mockTransport = {
        request: vi.fn().mockResolvedValue({ task_id: "t1", archived: true, session_id: "s1" }),
      };
      const client = createClient(testConfig(), mockTransport as any);

      await client.commit("sess-abc");

      expect(debugSpy).toHaveBeenCalledWith("[ov] commit:", "sess-abc", { task_id: "t1", archived: true, session_id: "s1" });
    });
  });

  describe("Session Sync: shutdown", () => {
    it("logs shutdown", () => {
      const client = mockClient();
      const sync = new SessionSync(client, mockOpts());

      sync.onShutdown();

      expect(debugSpy).toHaveBeenCalledWith("[ov] shutdown");
    });
  });

  describe("Session Sync: OV Session creation", () => {
    it("logs session creation with session ID", async () => {
      const client = mockClient();
      const sync = new SessionSync(client, mockOpts());

      sync.onMessageEnd(makeMessage("user", "hello"));
      await sync.flush();

      expect(debugSpy).toHaveBeenCalledWith("[ov] session created:", "sess-123");
    });
  });
});
