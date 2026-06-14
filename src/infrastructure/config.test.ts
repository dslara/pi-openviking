import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  loadConfig,
  mergeBehaviorIntoRecall,
  BUILTIN_PROFILES,
  LoggerConfigSchema,
  LoggerConfig,
  ProfileBehaviorSchema,
  ProfileBehaviorSchemaType,
  ProfileConfigSchema,
  ProfileConfigSchemaType,
  PiOVConfig,
  OVAdapterConfig,
  RecallConfigSchemaType,
  ProfileSectionSchema,
  readSettings,
} from "./config";

function withTempDir(fn: (dir: string) => void) {
  const dir = join(tmpdir(), `ov-config-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    fn(dir);
  } finally {
    // cleanup not needed
  }
}

const OLD_ENV = process.env;

describe("loadConfig", () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("OV_")) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns DEFAULT_CONFIG when no env vars or settings file exist", () => {
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("env OV_LOG_LEVEL=debug overrides default log level", () => {
    process.env.OV_LOG_LEVEL = "debug";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.logger.level).toBe("debug");
    expect(result.logger.maxSize).toBe(DEFAULT_CONFIG.logger.maxSize);
    expect(result.logger.path).toBe(DEFAULT_CONFIG.logger.path);
  });

  it("env OV_LOG_PATH overrides default path", () => {
    process.env.OV_LOG_PATH = "/custom/path.log";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.logger.path).toBe("/custom/path.log");
    expect(result.logger.level).toBe(DEFAULT_CONFIG.logger.level);
  });

  it("env OV_LOG_MAX_SIZE=999999 overrides default maxSize", () => {
    process.env.OV_LOG_MAX_SIZE = "999999";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.logger.maxSize).toBe(999999);
  });

  it("settings.json overrides env var (pi-openviking namespace)", () => {
    withTempDir((dir) => {
      process.env.OV_LOG_LEVEL = "debug";
      const piDir = join(dir, ".pi");
      mkdirSync(piDir, { recursive: true });
      writeFileSync(
        join(piDir, "settings.json"),
        JSON.stringify({ "pi-openviking": { logger: { level: "warn" } } }),
      );

      const result = loadConfig(dir);
      expect(result.logger.level).toBe("warn");
    });
  });

  it("settings.json can set activeProfile to a valid built-in profile", () => {
    withTempDir((dir) => {
      const piDir = join(dir, ".pi");
      mkdirSync(piDir, { recursive: true });
      writeFileSync(
        join(piDir, "settings.json"),
        JSON.stringify({ "pi-openviking": { profile: { activeProfile: "docs" } } }),
      );

      const result = loadConfig(dir);
      expect(result.profile.activeProfile).toBe("docs");
    });
  });

  it("throws when activeProfile not found in profiles registry", () => {
    withTempDir((dir) => {
      const piDir = join(dir, ".pi");
      mkdirSync(piDir, { recursive: true });
      writeFileSync(
        join(piDir, "settings.json"),
        JSON.stringify({ "pi-openviking": { profile: { activeProfile: "nonexistent" } } }),
      );

      expect(() => loadConfig(dir)).toThrow(/nonexistent/);
    });
  });

  it("env OV_TOP_N overrides recall.topN", () => {
    process.env.OV_TOP_N = "10";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.recall.topN).toBe(10);
    expect(result.recall.scoreThreshold).toBe(DEFAULT_CONFIG.recall.scoreThreshold);
  });

  it("env OV_SCORE_THRESHOLD overrides recall.scoreThreshold", () => {
    process.env.OV_SCORE_THRESHOLD = "0.8";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.recall.scoreThreshold).toBe(0.8);
  });

  it("env OV_SEARCH_MODE overrides recall.searchMode", () => {
    process.env.OV_SEARCH_MODE = "search";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.recall.searchMode).toBe("search");
  });

  it("env OV_TARGET_URI overrides recall.targetUri", () => {
    process.env.OV_TARGET_URI = "viking://docs";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.recall.targetUri).toBe("viking://docs");
  });

  it("env OV_EXPAND_GRAPH overrides recall.expandGraph", () => {
    process.env.OV_EXPAND_GRAPH = "true";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.recall.expandGraph).toBe(true);
  });

  it("env OV_AUTO_COMMIT_INTERVAL overrides ov.autoCommitIntervalMs", () => {
    process.env.OV_AUTO_COMMIT_INTERVAL = "60000";
    const result = loadConfig("/tmp/nonexistent-config-test");
    expect(result.ov.autoCommitIntervalMs).toBe(60000);
  });

  it("settings.json can override recall fields", () => {
    withTempDir((dir) => {
      const piDir = join(dir, ".pi");
      mkdirSync(piDir, { recursive: true });
      writeFileSync(
        join(piDir, "settings.json"),
        JSON.stringify({ "pi-openviking": { recall: { topN: 3, searchMode: "search" } } }),
      );
      const result = loadConfig(dir);
      expect(result.recall.topN).toBe(3);
      expect(result.recall.searchMode).toBe("search");
      expect(result.recall.scoreThreshold).toBe(DEFAULT_CONFIG.recall.scoreThreshold);
    });
  });
});

describe("mergeBehaviorIntoRecall", () => {
  const base = {
    targetUri: undefined,
    topN: 8,
    scoreThreshold: 0.5,
    maxTokens: 4000,
    expandGraph: false as const,
    expandGraphDepth: 1 as const,
    expandGraphMaxRatio: 0.2,
    expandGraphMinSeedScore: 0.4,
    searchMode: "search" as const,
    recallSearchTimeout: 60000,
    autoRecall: true as const,
  };

  it("empty behavior returns base unchanged", () => {
    const merged = mergeBehaviorIntoRecall(base, {});
    expect(merged).toEqual(base);
  });

  it("overrides all 6 fields", () => {
    const behavior = {
      targetUri: "viking://custom/**",
      topN: 15,
      scoreThreshold: 0.6,
      searchMode: "search" as const,
      expandGraph: true,
      autoRecall: false,
    };
    const merged = mergeBehaviorIntoRecall(base, behavior);
    expect(merged.targetUri).toBe("viking://custom/**");
    expect(merged.topN).toBe(15);
    expect(merged.scoreThreshold).toBe(0.6);
    expect(merged.searchMode).toBe("search");
    expect(merged.expandGraph).toBe(true);
    expect(merged.autoRecall).toBe(false);
    expect(merged.maxTokens).toBe(4000);
  });

  it("partial override keeps other fields at base values", () => {
    const merged = mergeBehaviorIntoRecall(base, { topN: 10, searchMode: "search" });
    expect(merged.topN).toBe(10);
    expect(merged.searchMode).toBe("search");
    expect(merged.scoreThreshold).toBe(0.5);
    expect(merged.autoRecall).toBe(true);
    expect(merged.targetUri).toBeUndefined();
  });

  it("autoRecall=false overrides base true", () => {
    const merged = mergeBehaviorIntoRecall(base, { autoRecall: false });
    expect(merged.autoRecall).toBe(false);
    expect(merged.topN).toBe(8);
  });

  it("does not mutate the base object", () => {
    const baseClone = { ...base };
    mergeBehaviorIntoRecall(base, { topN: 99 });
    expect(base.topN).toBe(8);
  });

  it("fields not in behavior keep base values", () => {
    const merged = mergeBehaviorIntoRecall(base, { expandGraph: true });
    expect(merged.expandGraph).toBe(true);
    expect(merged.topN).toBe(8);
    expect(merged.scoreThreshold).toBe(0.5);
    expect(merged.searchMode).toBe("search");
    expect(merged.autoRecall).toBe(true);
    expect(merged.targetUri).toBeUndefined();
    expect(merged.maxTokens).toBe(4000);
  });
});

describe("ConfigSchema validation", () => {
  it("parse({}) returns valid config with all defaults filled", () => {
    const config = ConfigSchema.parse({});
    expect(config.logger.level).toBe("info");
    expect(config.profile.activeProfile).toBe("default");
  });

  it("partial override keeps other defaults", () => {
    const config = ConfigSchema.parse({ logger: { level: "debug" } });
    expect(config.logger.level).toBe("debug");
    expect(config.profile.activeProfile).toBe("default");
  });

  it("invalid logger level throws ZodError", () => {
    const { ZodError } = require("zod");
    expect(() => ConfigSchema.parse({ logger: { level: "invalid" } })).toThrow(ZodError);
  });

  it("invalid maxSize (negative) throws ZodError", () => {
    const { ZodError } = require("zod");
    expect(() => ConfigSchema.parse({ logger: { maxSize: -1 } })).toThrow(ZodError);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("contains all required sections", () => {
    expect(DEFAULT_CONFIG.logger).toBeDefined();
    expect(DEFAULT_CONFIG.profile).toBeDefined();
    expect(DEFAULT_CONFIG.recall).toBeDefined();
  });

  it("recall defaults match expected values", () => {
    expect(DEFAULT_CONFIG.recall.targetUri).toBeUndefined();
    expect(DEFAULT_CONFIG.recall.topN).toBe(8);
    expect(DEFAULT_CONFIG.recall.scoreThreshold).toBe(0.5);
    expect(DEFAULT_CONFIG.recall.expandGraph).toBe(true);
    expect(DEFAULT_CONFIG.recall.searchMode).toBe("search");
    expect(DEFAULT_CONFIG.recall.autoRecall).toBe(true);
  });

  it("logger defaults match expected values", () => {
    expect(DEFAULT_CONFIG.logger.level).toBe("info");
  });

  it("profile defaults to 'default'", () => {
    expect(DEFAULT_CONFIG.profile.activeProfile).toBe("default");
  });
});

describe("BUILTIN_PROFILES", () => {
  it("contains default, web-dev, docs, learning", () => {
    expect(BUILTIN_PROFILES.default).toBeDefined();
    expect(BUILTIN_PROFILES["web-dev"]).toBeDefined();
    expect(BUILTIN_PROFILES.docs).toBeDefined();
    expect(BUILTIN_PROFILES.learning).toBeDefined();
  });

  it("web-dev differs from default (expandGraph=false)", () => {
    expect(BUILTIN_PROFILES["web-dev"].behavior.expandGraph).toBe(false);
    // default profile behavior doesn't set expandGraph (Zod default takes effect)
    expect(BUILTIN_PROFILES.default.behavior.expandGraph).toBeUndefined();
  });
});

describe("types are exported as expected", () => {
  it("LoggerConfig is a type (not runtime)", () => {
    // Just verify the named type exports exist by checking module shape
    expect(typeof LoggerConfigSchema).toBe("object");
    expect(typeof ProfileBehaviorSchema).toBe("object");
    expect(typeof ProfileConfigSchema).toBe("object");
    expect(typeof ProfileSectionSchema).toBe("object");
    expect(typeof ConfigSchema).toBe("object");
  });

  it("PiOVConfig type is inferable", () => {
    const config: PiOVConfig = DEFAULT_CONFIG;
    expect(config.ov.endpoint).toBe("http://localhost:1933");
  });

  it("OVAdapterConfig type is inferable", () => {
    const cfg: OVAdapterConfig = DEFAULT_CONFIG.ov;
    expect(cfg.timeout).toBe(30000);
  });
});

describe("readSettings", () => {
  it("returns empty object for nonexistent dir", () => {
    const result = readSettings("/tmp/nonexistent-readsettings", "pi-openviking");
    expect(result).toEqual({});
  });

  it("reads settings from .pi/settings.json with namespace", () => {
    withTempDir((dir) => {
      const piDir = join(dir, ".pi");
      mkdirSync(piDir, { recursive: true });
      writeFileSync(
        join(piDir, "settings.json"),
        JSON.stringify({ "pi-openviking": { recall: { topN: 5 } } }),
      );
      const result = readSettings(dir, "pi-openviking");
      expect(result).toEqual({ recall: { topN: 5 } });
    });
  });
});
