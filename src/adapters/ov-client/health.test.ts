import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { HealthCheck } from "./health";

// ── Healthy server (returns 200 on /ready) ──────────────────────────────────
let healthyServer: http.Server;
let healthyPort: number;

beforeAll(async () => {
  healthyServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  await new Promise<void>((resolve) => {
    healthyServer.listen(0, "127.0.0.1", () => {
      healthyPort = (healthyServer.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(() => {
  healthyServer?.close();
});

// ── Unhealthy server (returns 503 on /ready) ────────────────────────────────
let unhealthyServer: http.Server;
let unhealthyPort: number;

beforeAll(async () => {
  unhealthyServer = http.createServer((_req, res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "unavailable" }));
  });

  await new Promise<void>((resolve) => {
    unhealthyServer.listen(0, "127.0.0.1", () => {
      unhealthyPort = (unhealthyServer.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(() => {
  unhealthyServer?.close();
});

describe("HealthCheck", () => {
  it("returns ok=true when /ready responds 200", async () => {
    const hc = new HealthCheck(`http://127.0.0.1:${healthyPort}`);
    const result = await hc.check();
    expect(result.ok).toBe(true);
  });

  it("records latencyMs on success", async () => {
    const hc = new HealthCheck(`http://127.0.0.1:${healthyPort}`);
    const result = await hc.check();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false when /ready returns 503", async () => {
    const hc = new HealthCheck(`http://127.0.0.1:${unhealthyPort}`);
    const result = await hc.check();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });

  it("returns ok=false with error on connection refused", async () => {
    // Use a port unlikely to be listening
    const hc = new HealthCheck(`http://127.0.0.1:1`);
    const result = await hc.check();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
  });
});
