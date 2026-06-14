import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init, shutdown } from "./lifecycle";
import { FileLogger } from "../adapters/driven/logger/file-logger";
import { RecallCurator } from "../domain/recall/recall-curator";
import { RecallService } from "../domain/recall/recall-service";
import { SessionService } from "../domain/services/session-service";
import { SearchService } from "../domain/services/search-service";
import { ProfileManager } from "../domain/profile/service/ProfileManager";
import type { OpenVikingClient } from "../domain/client/open-viking-client";
import type { Logger } from "../domain/ports/logger";
import type { KnowledgeBase } from "../domain/ports/knowledge-base";
import type { FsStore } from "../domain/ports/fs-store";
import type { GraphStore } from "../domain/ports/graph-store";
import type { SessionStore } from "../domain/ports/session-store";
import type { ResourceStore } from "../domain/ports/resource-store";
import type { SkillStore } from "../domain/ports/skill-store";

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

  it("returns config, logger and container", async () => {
    const result = await init(tmpDir);
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("logger");
    expect(result).toHaveProperty("container");
  });

  it("container resolves config token", async () => {
    const { container } = await init(tmpDir);
    const config = container.resolve("config");
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("container resolves logger as FileLogger", async () => {
    const { container } = await init(tmpDir);
    const logger = container.resolve<Logger>("logger");
    expect(logger).toBeInstanceOf(FileLogger);
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.isEnabled).toBe("function");
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

  it("container resolves knowledgeBase adapter", async () => {
    const { container } = await init(tmpDir);
    const kb = container.resolve<KnowledgeBase>("knowledgeBase");
    expect(kb).toBeDefined();
    expect(typeof kb.find).toBe("function");
    expect(typeof kb.search).toBe("function");
  });

  it("container resolves fsStore adapter", async () => {
    const { container } = await init(tmpDir);
    const fs = container.resolve<FsStore>("fsStore");
    expect(fs).toBeDefined();
    expect(typeof fs.read).toBe("function");
    expect(typeof fs.write).toBe("function");
  });

  it("container resolves graphStore adapter", async () => {
    const { container } = await init(tmpDir);
    const gs = container.resolve<GraphStore>("graphStore");
    expect(gs).toBeDefined();
    expect(typeof gs.link).toBe("function");
    expect(typeof gs.graph).toBe("function");
  });

  it("container resolves sessionStore adapter", async () => {
    const { container } = await init(tmpDir);
    const ss = container.resolve<SessionStore>("sessionStore");
    expect(ss).toBeDefined();
    expect(typeof ss.create).toBe("function");
    expect(typeof ss.commit).toBe("function");
  });

  it("adapter instances are singletons (same reference on second resolve)", async () => {
    const { container } = await init(tmpDir);
    const kb1 = container.resolve("knowledgeBase");
    const kb2 = container.resolve("knowledgeBase");
    expect(kb1).toBe(kb2);
  });

  // ── F4 services ─────────────────────────────────────────────────────────────

  it("container resolves recallCurator as RecallCurator instance", async () => {
    const { container } = await init(tmpDir);
    const curator = container.resolve<RecallCurator>("recallCurator");
    expect(curator).toBeInstanceOf(RecallCurator);
    expect(typeof curator.curate).toBe("function");
  });

  it("container resolves sessionService as SessionService instance", async () => {
    const { container } = await init(tmpDir);
    const svc = container.resolve<SessionService>("sessionService");
    expect(svc).toBeInstanceOf(SessionService);
    expect(typeof svc.createAndSet).toBe("function");
  });

  it("container resolves recallService as RecallService instance", async () => {
    const { container } = await init(tmpDir);
    const svc = container.resolve<RecallService>("recallService");
    expect(svc).toBeInstanceOf(RecallService);
    expect(typeof svc.recall).toBe("function");
  });

  it("F4 services are singletons (same reference on second resolve)", async () => {
    const { container } = await init(tmpDir);
    const c1 = container.resolve("recallCurator");
    const c2 = container.resolve("recallCurator");
    expect(c1).toBe(c2);

    const s1 = container.resolve("sessionService");
    const s2 = container.resolve("sessionService");
    expect(s1).toBe(s2);

    const r1 = container.resolve("recallService");
    const r2 = container.resolve("recallService");
    expect(r1).toBe(r2);
  });

  it("recallService.recall returns empty result when KB returns empty", async () => {
    const { container } = await init(tmpDir);
    const svc = container.resolve<RecallService>("recallService");
    // enabled=true but OV not running → ConnectionError caught → empty result
    const result = await svc.recall("test query");
    expect(result).toEqual({ items: [], tokens: 0, formatted: "", total: 0, timedOut: false });
  });

  it("sessionService is wired to sessionStore", async () => {
    const { container } = await init(tmpDir);
    const svc = container.resolve<SessionService>("sessionService");
    expect(svc).toBeInstanceOf(SessionService);
    expect(typeof svc.createAndSet).toBe("function");
    expect(typeof svc.commit).toBe("function");
    expect(svc.getActive()).toBeNull();
  });

  // ── F5 services ─────────────────────────────────────────────────────────────

  it("container resolves searchService as SearchService instance", async () => {
    const { container } = await init(tmpDir);
    const svc = container.resolve<SearchService>("searchService");
    expect(svc).toBeInstanceOf(SearchService);
    expect(typeof svc.search).toBe("function");
    expect(typeof svc.glob).toBe("function");
    expect(typeof svc.grep).toBe("function");
  });

  it("searchService is singleton", async () => {
    const { container } = await init(tmpDir);
    const s1 = container.resolve("searchService");
    const s2 = container.resolve("searchService");
    expect(s1).toBe(s2);
  });

  // ── F7a — ProfileManager ───────────────────────────────────────────────────

  it("container resolves profileManager as ProfileManager instance", async () => {
    const { container } = await init(tmpDir);
    const pm = container.resolve<ProfileManager>("profileManager");
    expect(pm).toBeInstanceOf(ProfileManager);
    expect(typeof pm.getActive).toBe("function");
    expect(typeof pm.resolve).toBe("function");
    expect(typeof pm.apply).toBe("function");
    expect(typeof pm.list).toBe("function");
  });

  it("profileManager is singleton", async () => {
    const { container } = await init(tmpDir);
    const p1 = container.resolve("profileManager");
    const p2 = container.resolve("profileManager");
    expect(p1).toBe(p2);
  });

  it("profileManager has correct activeProfile from config", async () => {
    const { container } = await init(tmpDir);
    const pm = container.resolve<ProfileManager>("profileManager");
    expect(pm.getActive()).toBe("default");
  });

  it("profileManager resolves default profile with correct behavior", async () => {
    const { container } = await init(tmpDir);
    const pm = container.resolve<ProfileManager>("profileManager");
    const behavior = pm.resolve("default");
    expect(behavior.topN).toBe(3);
    expect(behavior.scoreThreshold).toBe(0.5);
    expect(behavior.searchMode).toBe("search");
    expect(behavior.autoRecall).toBe(true);
  });

  it("merged recall config reflects profile behavior override", async () => {
    const { container } = await init(tmpDir);
    const config = container.resolve<import("./config/schema").PiOVConfig>("config");
    // Default profile sets topN=3, but RecallConfig default is topN=8
    // So merged config should have topN=3 from profile
    expect(config.recall.topN).toBe(3);
    expect(config.recall.scoreThreshold).toBe(0.5);
    expect(config.recall.searchMode).toBe("search");
    expect(config.recall.autoRecall).toBe(true);
  });

  it("container resolves ovClient with FsClient methods", async () => {
    const { container } = await init(tmpDir);
    const client = container.resolve<OpenVikingClient>("ovClient");
    expect(typeof client.read).toBe("function");
    expect(typeof client.save).toBe("function");
    expect(typeof client.mkdir).toBe("function");
    expect(typeof client.mv).toBe("function");
    expect(typeof client.list).toBe("function");
    expect(typeof client.tree).toBe("function");
    expect(typeof client.stat).toBe("function");
    expect(typeof client.delete).toBe("function");
    expect(typeof client.reindex).toBe("function");
  });

  it("ovClient is singleton", async () => {
    const { container } = await init(tmpDir);
    const s1 = container.resolve("ovClient");
    const s2 = container.resolve("ovClient");
    expect(s1).toBe(s2);
  });

  it("container resolves resourceStore adapter", async () => {
    const { container } = await init(tmpDir);
    const store = container.resolve<ResourceStore>("resourceStore");
    expect(store).toBeDefined();
    expect(typeof store.importUrl).toBe("function");
  });

  it("container resolves skillStore adapter", async () => {
    const { container } = await init(tmpDir);
    const store = container.resolve<SkillStore>("skillStore");
    expect(store).toBeDefined();
    expect(typeof store.addSkill).toBe("function");
  });
});

describe("shutdown", () => {
  it("does not throw", () => {
    expect(() => shutdown()).not.toThrow();
  });
});
