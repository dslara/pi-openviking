import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalEnv = { ...process.env };

describe("loadConfig", () => {
  let testDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    testDir = join(tmpdir(), `ov-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeSettings(settings: Record<string, unknown>) {
    mkdirSync(join(testDir, ".pi"), { recursive: true });
    writeFileSync(join(testDir, ".pi", "settings.json"), JSON.stringify(settings));
  }

  test("returns defaults when no settings file or env", () => {
    delete process.env.OPENVIKING_ENDPOINT;
    delete process.env.OPENVIKING_TIMEOUT;
    delete process.env.OPENVIKING_COMMIT_TIMEOUT;
    delete process.env.OPENVIKING_API_KEY;
    delete process.env.OPENVIKING_ACCOUNT;
    delete process.env.OPENVIKING_USER;

    const config = loadConfig(testDir);

    expect(config).toEqual({
      endpoint: "http://localhost:1933",
      timeout: 30000,
      commitTimeout: 60000,
      apiKey: "dev",
      account: "default",
      user: "default",
    });
  });

  test("merges .pi/settings.json values over defaults", () => {
    writeSettings({
      openVikingEndpoint: "http://custom:1933",
      openVikingTimeout: 10000,
      openVikingCommitTimeout: 120000,
      openVikingApiKey: "my-key",
      openVikingAccount: "acme",
      openVikingUser: "alice",
    });

    const config = loadConfig(testDir);

    expect(config).toEqual({
      endpoint: "http://custom:1933",
      timeout: 10000,
      commitTimeout: 120000,
      apiKey: "my-key",
      account: "acme",
      user: "alice",
    });
  });

  test("settings.json overrides env vars", () => {
    writeSettings({
      openVikingEndpoint: "http://custom:1933",
      openVikingTimeout: 10000,
      openVikingCommitTimeout: 120000,
      openVikingApiKey: "my-key",
      openVikingAccount: "acme",
      openVikingUser: "alice",
    });
    process.env.OPENVIKING_ENDPOINT = "http://env:1933";
    process.env.OPENVIKING_TIMEOUT = "5000";
    process.env.OPENVIKING_COMMIT_TIMEOUT = "30000";
    process.env.OPENVIKING_API_KEY = "env-key";
    process.env.OPENVIKING_ACCOUNT = "env-acct";
    process.env.OPENVIKING_USER = "env-user";

    const config = loadConfig(testDir);

    expect(config).toEqual({
      endpoint: "http://custom:1933",
      timeout: 10000,
      commitTimeout: 120000,
      apiKey: "my-key",
      account: "acme",
      user: "alice",
    });
  });

  test("env vars work without settings.json", () => {
    process.env.OPENVIKING_ENDPOINT = "http://env-only:1933";
    delete process.env.OPENVIKING_TIMEOUT;

    const config = loadConfig(testDir);

    expect(config.endpoint).toBe("http://env-only:1933");
    expect(config.timeout).toBe(30000);
  });
});
