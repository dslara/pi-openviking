/**
 * File-based SessionMapStore adapter.
 *
 * Persists Pi↔OV session mapping as a JSON file.
 * Writes atomically via temp-file + rename.
 */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { SessionMapStore, SessionMeta } from "../../domain/ports/session-map-store";

export class FileSessionMapStore implements SessionMapStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async load(): Promise<Record<string, SessionMeta>> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};
      return parsed as Record<string, SessionMeta>;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  async save(map: Record<string, SessionMeta>): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Atomic write: write to temp file, then rename
    const tmp = resolve(tmpdir(), `openviking-session-map-${randomUUID()}.json`);
    await writeFile(tmp, JSON.stringify(map, null, 2), "utf-8");
    await rename(tmp, this.filePath);
  }
}
