import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OpenVikingClient } from "../src/ov-client/client";
import type { OpenVikingConfig } from "../src/shared/config";

const appendFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  appendFileSync: appendFileSyncMock,
}));

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
  beforeEach(() => {
    appendFileSyncMock.mockClear();
  });

  describe("Logger module", () => {
    it("debug writes to log file when OV_DEBUG is set", async () => {
      const prev = process.env.OV_DEBUG;
      process.env.OV_DEBUG = "true";
      vi.resetModules();

      const { logger } = await import("../src/shared/logger");
      logger.debug("test message");

      expect(appendFileSyncMock).toHaveBeenCalled();
      const call = appendFileSyncMock.mock.calls[0] as [string, string];
      expect(call[1]).toContain("[DEBUG]");
      expect(call[1]).toContain("test message");

      process.env.OV_DEBUG = prev;
    });

    it("debug is silent when OV_DEBUG is false", async () => {
      const prev = process.env.OV_DEBUG;
      process.env.OV_DEBUG = "false";
      vi.resetModules();

      const { logger } = await import("../src/shared/logger");
      logger.debug("should not appear");

      expect(appendFileSyncMock).not.toHaveBeenCalled();

      process.env.OV_DEBUG = prev;
    });

    it("error always writes to log file", async () => {
      vi.resetModules();
      const { logger } = await import("../src/shared/logger");
      logger.error("something broke");

      expect(appendFileSyncMock).toHaveBeenCalled();
      const call = appendFileSyncMock.mock.calls[0] as [string, string];
      expect(call[1]).toContain("[ERROR]");
      expect(call[1]).toContain("something broke");
    });
  });

  describe("No console.* usage in source", () => {
    it("has no console.debug, console.error, or console.log in src/", async () => {
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
          if (/import.*from.*logger/.test(lines[i])) continue;
          if (/console\.(debug|error|log|warn)\(/.test(lines[i])) {
            violations.push(`${f}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("Session Sync: error catch logs", () => {
    it("logs error when createSession throws", async () => {
      const { SessionSync } = await import("../src/session-sync/session");
      const client = mockClient({
        createSession: vi.fn().mockRejectedValue(new Error("connection refused")),
      });
      const sync = new SessionSync(client, mockOpts());

      sync.onMessageEnd(makeMessage("user", "hello"));
      await sync.flush();

      const calls = appendFileSyncMock.mock.calls.map((c: unknown[]) => c[1] as string);
      expect(calls.some((c: string) => c.includes("message send failed: connection refused"))).toBe(true);
    });

    it("logs error when sendMessage throws", async () => {
      const { SessionSync } = await import("../src/session-sync/session");
      const client = mockClient();
      (client.createSession as ReturnType<typeof vi.fn>).mockResolvedValue("sess-err");
      (client.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
      const sync = new SessionSync(client, mockOpts());

      sync.onMessageEnd(makeMessage("user", "hello"));
      await sync.flush();

      const calls = appendFileSyncMock.mock.calls.map((c: unknown[]) => c[1] as string);
      expect(calls.some((c: string) => c.includes("message send failed: timeout"))).toBe(true);
    });
  });

  describe("Client Adapter: commit", () => {
    it("logs commit call and result", async () => {
      const prev = process.env.OV_DEBUG;
      process.env.OV_DEBUG = "true";
      vi.resetModules();

      const { createClient } = await import("../src/ov-client/client");
      const mockTransport = {
        request: vi.fn().mockResolvedValue({ task_id: "t1", archived: true, session_id: "s1" }),
      };
      const client = createClient(testConfig(), mockTransport as any);

      await client.commit("sess-abc");

      const calls = appendFileSyncMock.mock.calls.map((c: unknown[]) => c[1] as string);
      expect(calls.some((c: string) => c.includes("commit: sess-abc"))).toBe(true);

      process.env.OV_DEBUG = prev;
    });
  });
});
