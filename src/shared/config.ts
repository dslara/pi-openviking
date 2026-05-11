import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface OpenVikingConfig {
  endpoint: string;
  timeout: number;
  commitTimeout: number;
  apiKey: string;
  account: string;
  user: string;
  autoRecallLimit: number;
  autoRecallTimeout: number;
  autoRecallTopN: number;
  openVikingAutoRecall: boolean;
  autoRecallScoreThreshold: number;
  autoRecallMaxContentChars: number;
  autoRecallPreferAbstract: boolean;
  autoRecallTokenBudget: number;
}

interface PiSettings {
  openVikingEndpoint?: string;
  openVikingTimeout?: number;
  openVikingCommitTimeout?: number;
  openVikingApiKey?: string;
  openVikingAccount?: string;
  openVikingUser?: string;
  openVikingAutoRecallLimit?: number;
  openVikingAutoRecallTimeout?: number;
  openVikingAutoRecallTopN?: number;
  openVikingAutoRecall?: boolean;
  openVikingAutoRecallScoreThreshold?: number;
  openVikingAutoRecallMaxContentChars?: number;
  openVikingAutoRecallPreferAbstract?: boolean;
  openVikingAutoRecallTokenBudget?: number;
  [key: string]: unknown;
}

function readPiSettings(cwd: string): PiSettings {
  try {
    const raw = readFileSync(join(cwd, ".pi", "settings.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function loadConfig(cwd: string): OpenVikingConfig {
  const settings = readPiSettings(cwd);

  return {
    endpoint:
      settings.openVikingEndpoint ??
      process.env.OPENVIKING_ENDPOINT ??
      "http://localhost:1933",
    timeout:
      settings.openVikingTimeout ??
      (process.env.OPENVIKING_TIMEOUT
        ? parseInt(process.env.OPENVIKING_TIMEOUT, 10)
        : undefined) ??
      30000,
    commitTimeout:
      settings.openVikingCommitTimeout ??
      (process.env.OPENVIKING_COMMIT_TIMEOUT
        ? parseInt(process.env.OPENVIKING_COMMIT_TIMEOUT, 10)
        : undefined) ??
      60000,
    apiKey:
      settings.openVikingApiKey ??
      process.env.OPENVIKING_API_KEY ??
      "dev",
    account:
      settings.openVikingAccount ??
      process.env.OPENVIKING_ACCOUNT ??
      "default",
    user:
      settings.openVikingUser ??
      process.env.OPENVIKING_USER ??
      "default",
    autoRecallLimit:
      settings.openVikingAutoRecallLimit ??
      (process.env.OPENVIKING_AUTO_RECALL_LIMIT
        ? parseInt(process.env.OPENVIKING_AUTO_RECALL_LIMIT, 10)
        : undefined) ??
      10,
    autoRecallTimeout:
      settings.openVikingAutoRecallTimeout ??
      (process.env.OPENVIKING_AUTO_RECALL_TIMEOUT
        ? parseInt(process.env.OPENVIKING_AUTO_RECALL_TIMEOUT, 10)
        : undefined) ??
      5000,
    autoRecallTopN:
      settings.openVikingAutoRecallTopN ??
      (process.env.OPENVIKING_AUTO_RECALL_TOPN
        ? parseInt(process.env.OPENVIKING_AUTO_RECALL_TOPN, 10)
        : undefined) ??
      5,
    openVikingAutoRecall:
      settings.openVikingAutoRecall ??
      (process.env.OPENVIKING_AUTO_RECALL
        ? process.env.OPENVIKING_AUTO_RECALL === "true"
        : undefined) ??
      true,
    autoRecallScoreThreshold:
      settings.openVikingAutoRecallScoreThreshold ??
      (process.env.OPENVIKING_AUTO_RECALL_SCORE_THRESHOLD
        ? parseFloat(process.env.OPENVIKING_AUTO_RECALL_SCORE_THRESHOLD)
        : undefined) ??
      0.15,
    autoRecallMaxContentChars:
      settings.openVikingAutoRecallMaxContentChars ??
      (process.env.OPENVIKING_AUTO_RECALL_MAX_CONTENT_CHARS
        ? parseInt(process.env.OPENVIKING_AUTO_RECALL_MAX_CONTENT_CHARS, 10)
        : undefined) ??
      500,
    autoRecallPreferAbstract:
      settings.openVikingAutoRecallPreferAbstract ??
      (process.env.OPENVIKING_AUTO_RECALL_PREFER_ABSTRACT
        ? process.env.OPENVIKING_AUTO_RECALL_PREFER_ABSTRACT === "true"
        : undefined) ??
      true,
    autoRecallTokenBudget:
      settings.openVikingAutoRecallTokenBudget ??
      (process.env.OPENVIKING_AUTO_RECALL_TOKEN_BUDGET
        ? parseInt(process.env.OPENVIKING_AUTO_RECALL_TOKEN_BUDGET, 10)
        : undefined) ??
      500,
  };
}
