import {
  appendFileSync,
  mkdirSync,
  existsSync,
  statSync,
  renameSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "fflate";
import { resolveHome } from "../../../infrastructure/path-resolver";
import type { Logger, LogLevel } from "../../../domain/ports/logger";
import type { LoggerConfig } from "../../../infrastructure/config";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class FileLogger implements Logger {
  private readonly path: string;
  private readonly levelRank: number;
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private readonly maxAge: number;

  constructor(opts: LoggerConfig) {
    this.path = resolveHome(opts.path);
    this.levelRank = LEVEL_RANK[opts.level];
    this.maxSize = opts.maxSize;
    this.maxFiles = opts.maxFiles;
    this.maxAge = opts.maxAge;
    this.ensureDir();
  }

  private ensureDir(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.write("debug", msg, ctx);
  }

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.write("info", msg, ctx);
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.write("warn", msg, ctx);
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    this.write("error", msg, ctx);
  }

  isEnabled(level: LogLevel): boolean {
    const rank = LEVEL_RANK[level];
    return rank !== undefined && rank >= this.levelRank;
  }

  private write(level: string, msg: string, ctx?: Record<string, unknown>): void {
    const rank = LEVEL_RANK[level as LogLevel] ?? 0;
    if (rank < this.levelRank) return;

    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        ...(ctx !== undefined ? { ctx } : {}),
      }) + "\n";

    appendFileSync(this.path, line);

    // Check rotation after write
    this.rotateIfNeeded();

    // Age cleanup on every write
    this.cleanupByAge();
  }

  private rotateIfNeeded(): void {
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(this.path);
    } catch {
      return;
    }
    if (st.size <= this.maxSize) return;

    // Gzip current content before rotating
    const content = readFileSync(this.path);

    // Remove the oldest rotated file if it exists
    const oldestPath = rotatedPath(this.path, this.maxFiles);
    if (existsSync(oldestPath)) {
      unlinkSync(oldestPath);
    }

    // Shift existing rotated files up (highest first)
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const src = rotatedPath(this.path, i);
      if (existsSync(src)) {
        const dst = rotatedPath(this.path, i + 1);
        renameSync(src, dst);
      }
    }

    // Write gzipped content to .1
    const gzPath = rotatedPath(this.path, 1);
    const gzBuffer = gzipSync(content);
    writeFileSync(gzPath, gzBuffer);

    // Truncate the current log file
    writeFileSync(this.path, "");

    // Check age-based cleanup
    this.cleanupByAge();
  }

  private cleanupByAge(): void {
    const now = Date.now();
    for (let i = 1; i <= this.maxFiles; i++) {
      const p = rotatedPath(this.path, i);
      try {
        const st = statSync(p);
        if (now - st.mtimeMs > this.maxAge) {
          unlinkSync(p);
        }
      } catch {
        // File doesn't exist — skip
      }
    }
  }
}

function rotatedPath(base: string, index: number): string {
  return base + "." + index + ".gz";
}
