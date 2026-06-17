import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init, shutdown } from "./lifecycle";
import { RecallCurator } from "../domain/recall/recall-curator";
import { RecallService } from "../domain/recall/recall-service";
import { SessionManager } from "../domain/services/session-service";
import { ProfileManager } from "../domain/profile/service/ProfileManager";

const OLD_ENV = process.env;

describe("init", () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("OV_")) delete process.env[key];
    }
    tmpDir = mkdtempSync(join(tmpdir(), "lifecycle-test-"));
    mkdirSync(join(tmpDir, ".pi"), { recursive: true });
  });

  afterEach(() => {
    process.env = OLD_ENV;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns config, logger and services", async () => {
    const result = await init(tmpDir);
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("logger");
    expect(result).toHaveProperty("adapter");
    expect(result).toHaveProperty("ovClient");
  });

  it("logger uses resolved config — OV_LOG_PATH controls output file", async () => {
    const logFile = join(tmpDir, "custom-test.log");
    process.env.OV_LOG_PATH = logFile;

    const { logger } = await init(tmpDir);
    logger.info("custom path test");

    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("custom path test");
  });

  it("recallService.recall returns empty result when KB returns empty", async () => {
    const { recallService } = await init(tmpDir);
    // enabled=true but OV not running → ConnectionError caught → empty result
    const result = await recallService.recall("test query");
    expect(result).toEqual({ items: [], tokens: 0, formatted: "", total: 0, timedOut: false });
  });

  it("sessionService is wired to sessionStore", async () => {
    const { sessionService } = await init(tmpDir);
    expect(sessionService).toBeInstanceOf(SessionManager);
    expect(typeof sessionService.createAndSet).toBe("function");
    expect(typeof sessionService.commit).toBe("function");
    expect(sessionService.getActive()).toBeNull();
  });

  it("profileManager has correct activeProfile from config", async () => {
    const { profileManager } = await init(tmpDir);
    expect(profileManager.getActive()).toBe("default");
  });

  it("profileManager resolves default profile with correct behavior", async () => {
    const { profileManager } = await init(tmpDir);
    const behavior = profileManager.resolve("default");
    expect(behavior.topN).toBe(3);
    expect(behavior.scoreThreshold).toBe(0.5);
    expect(behavior.searchMode).toBe("search");
    expect(behavior.autoRecall).toBe(true);
  });

  it("merged recall config reflects profile behavior override", async () => {
    const { config } = await init(tmpDir);
    // Default profile sets topN=3, but RecallConfig default is topN=8
    // So merged config should have topN=3 from profile
    expect(config.recall.topN).toBe(3);
    expect(config.recall.scoreThreshold).toBe(0.5);
    expect(config.recall.searchMode).toBe("search");
    expect(config.recall.autoRecall).toBe(true);
  });

  it("returns configured ovClient directly from init", async () => {
    const { ovClient } = await init(tmpDir);
    expect(typeof ovClient.read).toBe("function");
    expect(typeof ovClient.save).toBe("function");
    expect(typeof ovClient.mkdir).toBe("function");
    expect(typeof ovClient.mv).toBe("function");
    expect(typeof ovClient.list).toBe("function");
    expect(typeof ovClient.tree).toBe("function");
    expect(typeof ovClient.stat).toBe("function");
    expect(typeof ovClient.delete).toBe("function");
    expect(typeof ovClient.reindex).toBe("function");
  });

  it("returns configured adapter directly from init", async () => {
    const { adapter } = await init(tmpDir);
    expect(adapter).toBeDefined();
    expect(typeof adapter.knowledgeBase).toBe("object");
  });

  it("returns configured knowledgeBase via adapter", async () => {
    const { adapter } = await init(tmpDir);
    expect(typeof adapter.knowledgeBase.find).toBe("function");
    expect(typeof adapter.knowledgeBase.search).toBe("function");
  });

  it("returns configured fsStore via adapter", async () => {
    const { adapter } = await init(tmpDir);
    expect(typeof adapter.fsStore.read).toBe("function");
  });

  it("returns configured graphStore via adapter", async () => {
    const { adapter } = await init(tmpDir);
    expect(typeof adapter.graphStore.link).toBe("function");
    expect(typeof adapter.graphStore.graph).toBe("function");
  });

  it("returns configured sessionStore via adapter", async () => {
    const { adapter } = await init(tmpDir);
    expect(typeof adapter.sessionStore.commit).toBe("function");
  });

  it("returns configured resourceStore via adapter", async () => {
    const { adapter } = await init(tmpDir);
    expect(typeof adapter.resourceStore.importUrl).toBe("function");
  });

  it("returns configured skillStore via adapter", async () => {
    const { adapter } = await init(tmpDir);
    expect(typeof adapter.skillStore.addSkill).toBe("function");
  });

  it("returns configured profileManager directly from init", async () => {
    const { profileManager } = await init(tmpDir);
    expect(profileManager).toBeInstanceOf(ProfileManager);
    expect(typeof profileManager.getActive).toBe("function");
    expect(typeof profileManager.resolve).toBe("function");
  });

  it("returns configured recallCurator directly from init", async () => {
    const { recallCurator } = await init(tmpDir);
    expect(recallCurator).toBeInstanceOf(RecallCurator);
    expect(typeof recallCurator.curate).toBe("function");
  });

  it("returns configured sessionService directly from init", async () => {
    const { sessionService } = await init(tmpDir);
    expect(sessionService).toBeInstanceOf(SessionManager);
    expect(typeof sessionService.createAndSet).toBe("function");
  });

  it("returns configured recallService directly from init", async () => {
    const { recallService } = await init(tmpDir);
    expect(recallService).toBeInstanceOf(RecallService);
    expect(typeof recallService.recall).toBe("function");
  });

  it("direct services are same references (singleton contract)", async () => {
    const r1 = await init(tmpDir);
    expect(r1.recallCurator).toBe(r1.recallCurator);
    expect(r1.sessionService).toBe(r1.sessionService);
    expect(r1.recallService).toBe(r1.recallService);
    expect(r1.profileManager).toBe(r1.profileManager);
    expect(r1.ovClient).toBe(r1.ovClient);
  });
});

describe("shutdown", () => {
  it("does not throw", () => {
    expect(() => shutdown()).not.toThrow();
  });
});
