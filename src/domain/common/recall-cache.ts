const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SIZE = 50;

interface Entry {
  block: string;
  stats?: string;
  createdAt: number;
}

interface RecallCacheOpts {
  ttlMs?: number;
  maxSize?: number;
}

export class RecallCache {
  readonly #store = new Map<string, Entry>();
  readonly #ttlMs: number;
  readonly #maxSize: number;
  #hits = 0;
  #misses = 0;

  constructor(opts: RecallCacheOpts = {}) {
    this.#ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.#maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
  }

  get(hash: string): string | undefined {
    const entry = this.#store.get(hash);
    if (!entry) {
      this.#misses++;
      return undefined;
    }

    // Check TTL expiry
    if (Date.now() - entry.createdAt >= this.#ttlMs) {
      this.#store.delete(hash);
      this.#misses++;
      return undefined;
    }

    this.#hits++;
    return entry.block;
  }

  getStats(hash: string): string | undefined {
    const entry = this.#store.get(hash);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt >= this.#ttlMs) {
      this.#store.delete(hash);
      return undefined;
    }
    return entry.stats;
  }

  set(hash: string, block: string, stats?: string): void {
    // Evict oldest entry if at max size
    if (this.#store.size >= this.#maxSize) {
      const oldestKey = this.#store.keys().next().value;
      if (oldestKey !== undefined) {
        this.#store.delete(oldestKey);
      }
    }

    this.#store.set(hash, {
      block,
      stats,
      createdAt: Date.now(),
    });
  }

  invalidate(): void {
    this.#store.clear();
    this.#hits = 0;
    this.#misses = 0;
  }

  stats(): { size: number; hits: number; misses: number } {
    return {
      size: this.#store.size,
      hits: this.#hits,
      misses: this.#misses,
    };
  }
}
