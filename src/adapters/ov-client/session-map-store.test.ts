import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileSessionMapStore } from "./session-map-store";

describe("FileSessionMapStore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-map-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads empty object when file does not exist", async () => {
    const store = new FileSessionMapStore(join(tmpDir, "nonexistent.json"));
    const map = await store.load();
    expect(map).toEqual({});
  });

  it("saves and loads session map", async () => {
    const filePath = join(tmpDir, "session-map.json");
    const store = new FileSessionMapStore(filePath);

    const map = {
      "/sessions/test.jsonl": {
        ovSessionId: "ov-abc-123",
        syncedMessageKeys: ["msg-1", "msg-2"],
        lastCommitTime: 1717000000000,
      },
    };

    await store.save(map);
    const loaded = await store.load();
    expect(loaded).toEqual(map);
  });

  it("overwrites existing map on save", async () => {
    const filePath = join(tmpDir, "session-map.json");
    const store = new FileSessionMapStore(filePath);

    await store.save({
      "/old.jsonl": { ovSessionId: "ov-old", syncedMessageKeys: [] },
    });

    await store.save({
      "/new.jsonl": { ovSessionId: "ov-new", syncedMessageKeys: ["k1"] },
    });

    const loaded = await store.load();
    expect(Object.keys(loaded)).toHaveLength(1);
    expect(loaded["/new.jsonl"].ovSessionId).toBe("ov-new");
  });

  it("supports commitInFlight field", async () => {
    const filePath = join(tmpDir, "session-map.json");
    const store = new FileSessionMapStore(filePath);
    const map = {
      "/sessions/active.jsonl": {
        ovSessionId: "ov-inflight",
        syncedMessageKeys: [],
        commitInFlight: true,
      },
    };

    await store.save(map);
    const loaded = await store.load();
    expect(loaded["/sessions/active.jsonl"].commitInFlight).toBe(true);
  });

  it("creates parent directory automatically", async () => {
    const nested = join(tmpDir, "a", "b", "c", "map.json");
    const store = new FileSessionMapStore(nested);
    await store.save({
      "/test.jsonl": { ovSessionId: "ov-nested", syncedMessageKeys: [] },
    });
    const loaded = await store.load();
    expect(loaded["/test.jsonl"].ovSessionId).toBe("ov-nested");
  });
});
