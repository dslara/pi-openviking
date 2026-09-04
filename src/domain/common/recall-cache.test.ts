import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RecallCache } from "./recall-cache";

describe("RecallCache", () => {
  describe("initial state", () => {
    it("returns undefined for unknown key", () => {
      const cache = new RecallCache();
      expect(cache.get("nonexistent")).toBeUndefined();
    });
  });

  describe("set and get", () => {
    it("returns stored value after set", () => {
      const cache = new RecallCache();
      cache.set("abc", "relevant memories");
      expect(cache.get("abc")).toBe("relevant memories");
    });

    it("overwrites existing key on second set", () => {
      const cache = new RecallCache();
      cache.set("x", "first");
      cache.set("x", "second");
      expect(cache.get("x")).toBe("second");
    });

    it("stores stats alongside block", () => {
      const cache = new RecallCache();
      cache.set("key", "content", "3it 120tk");
      expect(cache.get("key")).toBe("content");
      expect(cache.getStats("key")).toBe("3it 120tk");
    });

    it("getStats returns undefined for missing key", () => {
      const cache = new RecallCache();
      expect(cache.getStats("missing")).toBeUndefined();
    });

    it("getStats returns undefined after TTL expiry", () => {
      vi.useFakeTimers();
      const cache = new RecallCache({ ttlMs: 10_000 });
      cache.set("key", "block", "stats");
      vi.advanceTimersByTime(10_001);
      expect(cache.getStats("key")).toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe("TTL eviction", () => {
    it("returns value before TTL expires", () => {
      vi.useFakeTimers();
      const cache = new RecallCache({ ttlMs: 10_000 });
      cache.set("key", "memories");

      vi.advanceTimersByTime(9_000);
      expect(cache.get("key")).toBe("memories");
      vi.useRealTimers();
    });

    it("returns undefined after TTL expires", () => {
      vi.useFakeTimers();
      const cache = new RecallCache({ ttlMs: 10_000 });
      cache.set("key", "memories");

      vi.advanceTimersByTime(10_001);
      expect(cache.get("key")).toBeUndefined();
      vi.useRealTimers();
    });

    it("uses default TTL of 5 minutes", () => {
      vi.useFakeTimers();
      const cache = new RecallCache();
      cache.set("key", "memories");

      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(cache.get("key")).toBe("memories");

      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(cache.get("key")).toBeUndefined();
      vi.useRealTimers();
    });

    it("unexpired entries survive when others expire", () => {
      vi.useFakeTimers();
      const cache = new RecallCache({ ttlMs: 10_000 });
      cache.set("old", "stale");
      vi.advanceTimersByTime(5_000);
      cache.set("fresh", "new");

      vi.advanceTimersByTime(6_000);
      expect(cache.get("old")).toBeUndefined();
      expect(cache.get("fresh")).toBe("new");
      vi.useRealTimers();
    });
  });

  describe("invalidate", () => {
    it("clears all entries", () => {
      const cache = new RecallCache();
      cache.set("a", "1");
      cache.set("b", "2");
      cache.invalidate();

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
    });

    it("resets hit/miss stats", () => {
      const cache = new RecallCache();
      cache.get("x"); // miss
      cache.get("y"); // miss
      expect(cache.stats().misses).toBe(2);

      cache.invalidate();
      expect(cache.stats().misses).toBe(0);
    });
  });

  describe("max-size eviction", () => {
    it("removes oldest entry when exceeding max size", () => {
      const cache = new RecallCache({ maxSize: 3 });
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      cache.set("d", "4"); // should evict 'a'

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe("2");
      expect(cache.get("d")).toBe("4");
    });

    it("default max size is 50 entries", () => {
      const cache = new RecallCache();
      for (let i = 0; i < 50; i++) cache.set(`k${i}`, `v${i}`);
      expect(cache.get("k0")).toBe("v0"); // still there
      cache.set("overflow", "x");
      expect(cache.get("k0")).toBeUndefined(); // evicted
    });
  });

  describe("stats", () => {
    it("returns correct hit/miss counts", () => {
      const cache = new RecallCache({ ttlMs: 100_000 });
      cache.set("a", "1");

      cache.get("a"); // hit
      cache.get("a"); // hit
      cache.get("missing"); // miss

      const s = cache.stats();
      expect(s.hits).toBe(2);
      expect(s.misses).toBe(1);
      expect(s.size).toBe(1);
    });

    it("miss increments after TTL expiry", () => {
      vi.useFakeTimers();
      const cache = new RecallCache({ ttlMs: 10_000 });
      cache.set("a", "1");

      cache.get("a"); // hit
      vi.advanceTimersByTime(10_001);
      cache.get("a"); // miss (expired, cleaned up)

      const s = cache.stats();
      expect(s.hits).toBe(1);
      expect(s.misses).toBe(1);
      expect(s.size).toBe(0);
      vi.useRealTimers();
    });
  });
});
