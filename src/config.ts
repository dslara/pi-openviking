import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface OpenVikingConfig {
  endpoint: string;
  timeout: number;
  apiKey: string;
  account: string;
  user: string;
}

interface PiSettings {
  openVikingEndpoint?: string;
  openVikingTimeout?: number;
  openVikingApiKey?: string;
  openVikingAccount?: string;
  openVikingUser?: string;
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
  };
}
