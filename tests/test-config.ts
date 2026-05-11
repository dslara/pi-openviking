import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, OpenVikingConfig } from "../src/config";

const META_PATH = join(__dirname, ".ov-test-meta.json");

export interface TestConfig {
  endpoint: string | null;
  managed: boolean;
}

function readTestMeta(): TestConfig | null {
  try {
    return JSON.parse(readFileSync(META_PATH, "utf-8")) as TestConfig;
  } catch {
    return null;
  }
}

/**
 * Returns a config pointing at the isolated test server when available.
 * Falls back to the regular dev server (OPENVIKING_ENDPOINT) if the test
 * server is not running.
 */
export function getTestConfig(): OpenVikingConfig {
  const meta = readTestMeta();
  const base = loadConfig(process.cwd());

  if (meta?.endpoint) {
    return { ...base, endpoint: meta.endpoint, apiKey: "test-root-key" };
  }

  return base;
}

/**
 * Skip helper: returns true when no test server is reachable.
 */
export async function isTestServerUp(config: OpenVikingConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.endpoint}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
