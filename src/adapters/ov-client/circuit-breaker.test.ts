import { describe, it, expect } from "vitest";
import { createCircuitBreaker, circuitBreakerReducer, allowsRequest, type CircuitBreakerState } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts CLOSED and allows requests", () => {
    const cb = createCircuitBreaker();
    expect(cb.status).toBe("CLOSED");
    expect(cb.consecutiveFails).toBe(0);
    expect(allowsRequest(cb)).toBe(true);
  });

  it("transitions to OPEN after threshold failures", () => {
    const cb = createCircuitBreaker(3, 30_000);
    const now = 1000;

    const after1 = circuitBreakerReducer(cb, { type: "RECORD_FAILURE", now });
    expect(after1.status).toBe("CLOSED");
    expect(after1.consecutiveFails).toBe(1);
    expect(allowsRequest(after1)).toBe(true);

    const after2 = circuitBreakerReducer(after1, { type: "RECORD_FAILURE", now });
    expect(after2.status).toBe("CLOSED");
    expect(after2.consecutiveFails).toBe(2);

    const after3 = circuitBreakerReducer(after2, { type: "RECORD_FAILURE", now });
    expect(after3.status).toBe("OPEN");
    expect(after3.consecutiveFails).toBe(3);
    expect(after3.openSince).toBe(now);
    expect(allowsRequest(after3)).toBe(false);
  });

  it("RECORD_SUCCESS in CLOSED resets consecutive fails", () => {
    const cb = createCircuitBreaker(3, 30_000);
    const now = 1000;

    const withFail = circuitBreakerReducer(cb, { type: "RECORD_FAILURE", now });
    expect(withFail.consecutiveFails).toBe(1);

    const reset = circuitBreakerReducer(withFail, { type: "RECORD_SUCCESS" });
    expect(reset.status).toBe("CLOSED");
    expect(reset.consecutiveFails).toBe(0);
  });

  it("TICK transitions OPEN to HALF_OPEN after resetTimeout", () => {
    const cb = createCircuitBreaker(3, 10_000);
    const openNow = 1000;

    const opened = circuitBreakerReducer(cb, { type: "RECORD_FAILURE", now: openNow });
    const opened2 = circuitBreakerReducer(opened, { type: "RECORD_FAILURE", now: openNow });
    const opened3 = circuitBreakerReducer(opened2, { type: "RECORD_FAILURE", now: openNow });
    expect(opened3.status).toBe("OPEN");

    // TICK before timeout — no change
    const early = circuitBreakerReducer(opened3, { type: "TICK", now: openNow + 5_000 });
    expect(early.status).toBe("OPEN");

    // TICK after resetTimeout — OPEN → HALF_OPEN
    const transition = circuitBreakerReducer(opened3, { type: "TICK", now: openNow + 10_000 });
    expect(transition.status).toBe("HALF_OPEN");
    expect(transition.lastProbeTime).toBe(openNow + 10_000);
    expect(allowsRequest(transition)).toBe(true);
  });

  it("HALF_OPEN success transitions to CLOSED", () => {
    const start: CircuitBreakerState = {
      status: "HALF_OPEN",
      consecutiveFails: 3,
      threshold: 3,
      resetTimeoutMs: 10_000,
      maxResetTimeoutMs: 300_000,
      openSince: 0,
      lastProbeTime: 10_000,
    };

    const closed = circuitBreakerReducer(start, { type: "RECORD_SUCCESS" });
    expect(closed.status).toBe("CLOSED");
    expect(closed.consecutiveFails).toBe(0);
  });

  it("HALF_OPEN failure transitions to OPEN with doubled timeout", () => {
    const start: CircuitBreakerState = {
      status: "HALF_OPEN",
      consecutiveFails: 3,
      threshold: 3,
      resetTimeoutMs: 10_000,
      maxResetTimeoutMs: 300_000,
      openSince: 0,
      lastProbeTime: 10_000,
    };

    const reopened = circuitBreakerReducer(start, { type: "RECORD_FAILURE", now: 12_000 });
    expect(reopened.status).toBe("OPEN");
    expect(reopened.consecutiveFails).toBe(4);
    expect(reopened.openSince).toBe(12_000);
    expect(reopened.resetTimeoutMs).toBe(20_000);
    expect(allowsRequest(reopened)).toBe(false);
  });

  it("HALF_OPEN failure doubles timeout up to maxResetTimeoutMs cap", () => {
    const start: CircuitBreakerState = {
      status: "HALF_OPEN",
      consecutiveFails: 3,
      threshold: 3,
      resetTimeoutMs: 200_000,
      maxResetTimeoutMs: 300_000,
      openSince: 0,
      lastProbeTime: 10_000,
    };

    const reopened = circuitBreakerReducer(start, { type: "RECORD_FAILURE", now: 12_000 });
    expect(reopened.status).toBe("OPEN");
    // 200k * 2 = 400k, capped at 300k
    expect(reopened.resetTimeoutMs).toBe(300_000);
  });

  it("HALF_OPEN failure doubles timeout within cap", () => {
    const start: CircuitBreakerState = {
      status: "HALF_OPEN",
      consecutiveFails: 3,
      threshold: 3,
      resetTimeoutMs: 10_000,
      maxResetTimeoutMs: 300_000,
      openSince: 0,
      lastProbeTime: 10_000,
    };

    const reopened = circuitBreakerReducer(start, { type: "RECORD_FAILURE", now: 12_000 });
    expect(reopened.status).toBe("OPEN");
    // 10k * 2 = 20k, under cap
    expect(reopened.resetTimeoutMs).toBe(20_000);
  });

  it("RESET returns to initial state", () => {
    const cb = createCircuitBreaker(3, 10_000);
    const now = 1000;

    const opened = circuitBreakerReducer(cb, { type: "RECORD_FAILURE", now });
    const opened2 = circuitBreakerReducer(opened, { type: "RECORD_FAILURE", now });
    const opened3 = circuitBreakerReducer(opened2, { type: "RECORD_FAILURE", now });
    expect(opened3.status).toBe("OPEN");

    const reset = circuitBreakerReducer(opened3, { type: "RESET" });
    expect(reset.status).toBe("CLOSED");
    expect(reset.consecutiveFails).toBe(0);
    expect(reset.openSince).toBeNull();
  });

  it("RECORD_SUCCESS in OPEN is a no-op", () => {
    const cb = createCircuitBreaker(3, 10_000);
    const now = 1000;

    const opened = circuitBreakerReducer(cb, { type: "RECORD_FAILURE", now });
    const opened2 = circuitBreakerReducer(opened, { type: "RECORD_FAILURE", now });
    const opened3 = circuitBreakerReducer(opened2, { type: "RECORD_FAILURE", now });
    expect(opened3.status).toBe("OPEN");

    const still = circuitBreakerReducer(opened3, { type: "RECORD_SUCCESS" });
    expect(still.status).toBe("OPEN");
  });
});
