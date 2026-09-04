import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// ── Logger config ─────────────────────────────────────────────────────────────

export const LoggerConfigSchema = z.object({
  path: z.string().default("~/.pi/agent/pi-openviking.log"),
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  maxSize: z.number().positive().default(10 * 1024 * 1024),
  maxFiles: z.number().int().positive().default(5),
  maxAge: z.number().positive().default(7 * 24 * 60 * 60 * 1000),
});

export type LoggerConfig = z.infer<typeof LoggerConfigSchema>;

// ── Profile behavior schema ────────────────────────────────────────────────────

export const ProfileBehaviorSchema = z.object({
  targetUri: z.string().optional(),
  topN: z.number().int().positive().optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
  searchMode: z.enum(["find", "search"]).optional(),
  expandGraph: z.boolean().optional(),
  autoRecall: z.boolean().optional(),
});

export type ProfileBehaviorSchemaType = z.infer<typeof ProfileBehaviorSchema>;

export const ProfileConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  behavior: ProfileBehaviorSchema.default({}),
});

export type ProfileConfigSchemaType = z.infer<typeof ProfileConfigSchema>;

export const BUILTIN_PROFILES: Record<string, ProfileConfigSchemaType> = {
  default: {
    name: "default",
    description: "Perfil padrão — equilibrado",
    behavior: {
      topN: 3,
      scoreThreshold: 0.5,
      searchMode: "search",
      autoRecall: true,
    },
  },
  "web-dev": {
    name: "web-dev",
    description: "Desenvolvimento web — contexto focado, sem expansão de grafo",
    behavior: {
      topN: 3,
      scoreThreshold: 0.5,
      searchMode: "search",
      expandGraph: false,
      autoRecall: true,
    },
  },
  docs: {
    name: "docs",
    description: "Documentação — busca ampla",
    behavior: {
      topN: 5,
      scoreThreshold: 0.3,
      searchMode: "search",
      autoRecall: true,
    },
  },
  learning: {
    name: "learning",
    description: "Aprendizado — captura tudo",
    behavior: {
      topN: 8,
      scoreThreshold: 0.2,
      searchMode: "search",
      autoRecall: true,
    },
  },
};

export const ProfileSectionSchema = z.object({
  activeProfile: z.string().default("default"),
  profiles: z.record(z.string(), ProfileConfigSchema).default(BUILTIN_PROFILES),
  autoDetectRules: z.record(z.string(), z.string()).default({}),
});

// ── Circuit breaker config ─────────────────────────────────────────────────────

const CircuitBreakerConfigSchema = z.object({
  threshold: z.coerce.number().int().min(1).default(3),
  resetTimeoutMs: z.coerce.number().int().positive().default(30_000),
  maxResetTimeoutMs: z.coerce.number().int().positive().default(300_000),
});

// ── OV Adapter config ──────────────────────────────────────────────────────────

const OVAdapterConfigSchema = z.object({
  endpoint: z.string().url().default("http://localhost:1933"),
  apiKey: z.string().default(""),
  account: z.string().default("default"),
  user: z.string().default("default"),
  agentId: z.string().default("pi"),
  timeout: z.number().positive().default(30_000),
  commitTimeout: z.number().positive().default(15_000),
  maxRetries: z.number().int().min(0).default(3),
  rateLimitPerSecond: z.number().min(0).default(0),
  autoCommitIntervalMs: z.number().min(0).default(300_000),
  circuitBreaker: CircuitBreakerConfigSchema.optional(),
});

export type OVAdapterConfig = z.infer<typeof OVAdapterConfigSchema>;

// ── Recall config ──────────────────────────────────────────────────────────────

const RecallConfigSchema = z.object({
  targetUri: z.string().optional(),
  topN: z.number().int().positive().default(8),
  scoreThreshold: z.number().min(0).max(1).default(0.5),
  maxTokens: z.number().int().positive().default(4000),
  expandGraph: z.boolean().default(true),
  expandGraphDepth: z.literal(1).default(1),
  expandGraphMaxRatio: z.number().min(0).max(1).default(0.2),
  expandGraphMinSeedScore: z.number().min(0).max(1).default(0.4),
  searchMode: z.enum(["find", "search"]).default("search"),
  recallSearchTimeout: z.number().positive().default(60_000),
  autoRecall: z.boolean().default(true),
});

export type RecallConfigSchemaType = z.infer<typeof RecallConfigSchema>;

// ── Root config ────────────────────────────────────────────────────────────────

export const ConfigSchema = z.object({
  logger: LoggerConfigSchema.default(() => LoggerConfigSchema.parse({})),
  profile: ProfileSectionSchema.default(() => ProfileSectionSchema.parse({})),
  ov: OVAdapterConfigSchema.default(() => OVAdapterConfigSchema.parse({})),
  recall: RecallConfigSchema.default(() => RecallConfigSchema.parse({})),
});

export type PiOVConfig = z.infer<typeof ConfigSchema>;

// ── Default config ─────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: PiOVConfig = ConfigSchema.parse({});

// ── Settings file reader ───────────────────────────────────────────────────────

export function readSettings(
  cwd: string,
  namespace?: string,
): Record<string, unknown> {
  try {
    const raw = readFileSync(join(cwd, ".pi", "settings.json"), "utf-8");
    const all = JSON.parse(raw) as Record<string, unknown>;
    if (namespace) {
      const ns = all[namespace];
      return typeof ns === "object" && ns !== null && !Array.isArray(ns)
        ? (ns as Record<string, unknown>)
        : {};
    }
    return all;
  } catch {
    return {};
  }
}

// ── Nested object helpers ──────────────────────────────────────────────────────

function setNested(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function mergeShallow(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    target[key] = source[key];
  }
}

// ── Config cascade ─────────────────────────────────────────────────────────────

export function loadConfig(cwd: string): PiOVConfig {
  // 1. Start with defaults
  const config: Record<string, unknown> = structuredClone(
    DEFAULT_CONFIG,
  ) as unknown as Record<string, unknown>;

  // 2. Overlay env vars — tabela declarativa
  const ENV_TO_PATH: Record<string, { path: string; parse?: (v: string) => unknown }> = {
    OV_LOG_PATH: { path: "logger.path" },
    OV_LOG_LEVEL: { path: "logger.level" },
    OV_LOG_MAX_SIZE: { path: "logger.maxSize", parse: Number },
    OV_ENDPOINT: { path: "ov.endpoint" },
    OV_API_KEY: { path: "ov.apiKey" },
    OV_ACCOUNT: { path: "ov.account" },
    OV_USER: { path: "ov.user" },
    OV_AGENT_ID: { path: "ov.agentId" },
    OV_TIMEOUT: { path: "ov.timeout", parse: Number },
    OV_COMMIT_TIMEOUT: { path: "ov.commitTimeout", parse: Number },
    OV_MAX_RETRIES: { path: "ov.maxRetries", parse: Number },
    OV_RATE_LIMIT: { path: "ov.rateLimitPerSecond", parse: Number },
    OV_AUTO_COMMIT_INTERVAL: { path: "ov.autoCommitIntervalMs", parse: Number },
    OV_CB_THRESHOLD: { path: "ov.circuitBreaker.threshold", parse: Number },
    OV_CB_RESET_TIMEOUT: { path: "ov.circuitBreaker.resetTimeoutMs", parse: Number },
    OV_TOP_N: { path: "recall.topN", parse: Number },
    OV_SCORE_THRESHOLD: { path: "recall.scoreThreshold", parse: Number },
    OV_MAX_TOKENS: { path: "recall.maxTokens", parse: Number },
    OV_EXPAND_GRAPH: { path: "recall.expandGraph", parse: (v) => v === "true" },
    OV_SEARCH_MODE: { path: "recall.searchMode" },
    OV_TARGET_URI: { path: "recall.targetUri" },
    OV_RECALL_SEARCH_TIMEOUT: { path: "recall.recallSearchTimeout", parse: Number },
  };

  for (const [envKey, { path, parse }] of Object.entries(ENV_TO_PATH)) {
    const val = process.env[envKey];
    if (val !== undefined) {
      setNested(config, path, parse ? parse(val) : val);
    }
  }

  // 3. Overlay file settings (pi-openviking namespace only)
  const fileSettings = readSettings(cwd, "pi-openviking");
  mergeShallow(config, fileSettings);

  // 4. Profile merge — happens in lifecycle.ts via mergeBehaviorIntoRecall(), not here

  // 5. Validate with Zod
  const parsed = ConfigSchema.parse(config);

  // 6. Verify activeProfile exists in profiles registry
  if (!parsed.profile.profiles[parsed.profile.activeProfile]) {
    throw new Error(
      `Config: activeProfile "${parsed.profile.activeProfile}" not found in profiles registry`,
    );
  }

  return parsed;
}

// ── Profile-merge helper ───────────────────────────────────────────────────────

/**
 * Deep-overrides RecallConfig fields with any defined ProfileBehavior values.
 * Fields that are undefined in the behavior are left untouched in the base config.
 * Returns a new object — does not mutate base.
 */
export function mergeBehaviorIntoRecall(
  base: RecallConfigSchemaType,
  behavior: ProfileBehaviorSchemaType,
): RecallConfigSchemaType {
  const merged = { ...base };

  if (behavior.targetUri !== undefined) merged.targetUri = behavior.targetUri;
  if (behavior.topN !== undefined) merged.topN = behavior.topN;
  if (behavior.scoreThreshold !== undefined)
    merged.scoreThreshold = behavior.scoreThreshold;
  if (behavior.searchMode !== undefined) merged.searchMode = behavior.searchMode;
  if (behavior.expandGraph !== undefined)
    merged.expandGraph = behavior.expandGraph;
  if (behavior.autoRecall !== undefined) merged.autoRecall = behavior.autoRecall;

  return merged;
}
