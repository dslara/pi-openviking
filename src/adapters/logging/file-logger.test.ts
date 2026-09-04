import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync, gzipSync } from "fflate";
import { FileLogger } from "./file-logger";
import type { Logger } from "../../domain/ports/logger";
import type { LoggerConfig } from "../../infrastructure/config";

function defaultOpts(path: string, overrides?: Partial<LoggerConfig>): LoggerConfig {
  return {
    path,
    level: "info",
    maxSize: 10 * 1024 * 1024,
    maxFiles: 5,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function makeLogger(tmpDir: string, overrides?: Partial<LoggerConfig>): Logger {
  return new FileLogger(defaultOpts(join(tmpDir, "test.log"), overrides));
}

describe("FileLogger", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "file-logger-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a valid JSON line to the log file", () => {
    const log = makeLogger(tmpDir);
    log.info("hello world");

    const content = readFileSync(join(tmpDir, "test.log"), "utf-8").trimEnd();
    const lines = content.split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.ts).toBeDefined();
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello world");
    expect(parsed.ctx).toBeUndefined();
  });

  it("serializes context object in the JSON line", () => {
    const log = makeLogger(tmpDir);
    log.info("with ctx", { userId: 42, action: "test" });

    const content = readFileSync(join(tmpDir, "test.log"), "utf-8").trimEnd();
    const parsed = JSON.parse(content);
    expect(parsed.ctx).toEqual({ userId: 42, action: "test" });
  });

  it("writes warn and error lines with correct level", () => {
    const log = makeLogger(tmpDir);

    log.warn("caution");
    log.error("boom");

    const content = readFileSync(join(tmpDir, "test.log"), "utf-8").trimEnd();
    const lines = content.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).level).toBe("warn");
    expect(JSON.parse(lines[0]).msg).toBe("caution");
    expect(JSON.parse(lines[1]).level).toBe("error");
    expect(JSON.parse(lines[1]).msg).toBe("boom");
  });

  it("drops lines below configured level", () => {
    const log = makeLogger(tmpDir, { level: "warn" });

    log.debug("should not appear");
    log.info("should also not appear");
    log.warn("should appear");
    log.error("should also appear");

    const content = readFileSync(join(tmpDir, "test.log"), "utf-8").trimEnd();
    const lines = content.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).level).toBe("warn");
    expect(JSON.parse(lines[0]).msg).toBe("should appear");
    expect(JSON.parse(lines[1]).level).toBe("error");
    expect(JSON.parse(lines[1]).msg).toBe("should also appear");
  });

  describe("rotation", () => {
    it("rotates when file exceeds maxSize and creates gzip archive", () => {
      const log = makeLogger(tmpDir, { maxSize: 50, maxFiles: 3 });

      for (let i = 0; i < 10; i++) {
        log.info("line " + i);
      }

      const logFiles = readdirSync(tmpDir).filter((f) => f.startsWith("test.log"));
      expect(logFiles.length).toBeGreaterThan(1);

      const gzFiles = readdirSync(tmpDir).filter((f) => f.endsWith(".gz"));
      for (const gzFile of gzFiles) {
        const gzContent = readFileSync(join(tmpDir, gzFile));
        expect(() => gunzipSync(gzContent)).not.toThrow();
      }
    });

    it("limits rotated files to maxFiles", () => {
      const log = makeLogger(tmpDir, { maxSize: 1, maxFiles: 2 });

      for (let i = 0; i < 50; i++) {
        log.info("x");
      }

      const gzFiles = readdirSync(tmpDir).filter((f) => f.endsWith(".gz"));
      expect(gzFiles.length).toBeLessThanOrEqual(2);
    });

    it("removes rotated files older than maxAge on next write", () => {
      const oldGzPath = join(tmpDir, "test.log.1.gz");
      const oldBuffer = gzipSync(Buffer.from("old rotated data"));
      writeFileSync(oldGzPath, oldBuffer);
      const oldDate = new Date(Date.now() - 3600_000);
      utimesSync(oldGzPath, oldDate, oldDate);

      const log = makeLogger(tmpDir, { maxAge: 10_000 });

      log.info("trigger");

      expect(existsSync(oldGzPath)).toBe(false);
    });
  });

  describe("isEnabled", () => {
    it("returns true for levels at or above the configured threshold", () => {
      const log = makeLogger(tmpDir, { level: "warn" });
      expect(log.isEnabled("warn")).toBe(true);
      expect(log.isEnabled("error")).toBe(true);
    });

    it("returns false for levels below the configured threshold", () => {
      const log = makeLogger(tmpDir, { level: "warn" });
      expect(log.isEnabled("debug")).toBe(false);
      expect(log.isEnabled("info")).toBe(false);
    });

    it("all levels enabled when threshold is debug", () => {
      const log = makeLogger(tmpDir, { level: "debug" });
      expect(log.isEnabled("debug")).toBe(true);
      expect(log.isEnabled("info")).toBe(true);
      expect(log.isEnabled("warn")).toBe(true);
      expect(log.isEnabled("error")).toBe(true);
    });
  });

  describe("directory creation", () => {
    it("creates parent directory if it does not exist", () => {
      const nestedDir = join(tmpDir, "deep", "nested", "dir");
      expect(existsSync(nestedDir)).toBe(false);

      const log = new FileLogger(defaultOpts(join(nestedDir, "test.log")));
      log.info("created dir on write");

      expect(existsSync(nestedDir)).toBe(true);
      expect(existsSync(join(nestedDir, "test.log"))).toBe(true);
    });
  });
});
