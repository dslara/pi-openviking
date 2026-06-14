import type { OVAdapterConfig } from "../../../infrastructure/config";
import { toDomainError } from "./mappers/ov-mappers";
import { ConnectionError, DomainError } from "../../../domain/errors/domain-error";
import type { Logger } from "../../../domain/ports/logger";
import {
  createCircuitBreaker,
  circuitBreakerReducer,
  allowsRequest,
  type CircuitBreakerState,
} from "./circuit-breaker";

export interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Token-bucket rate limiter.
 * When maxTokens = 0 (disabled), acquire() resolves immediately.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly intervalMs: number;

  constructor(maxPerSecond: number) {
    this.maxTokens = maxPerSecond > 0 ? maxPerSecond : 0;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.intervalMs = maxPerSecond > 0 ? Math.ceil(1000 / maxPerSecond) : 0;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (this.maxTokens === 0) return;

    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Wait for next token — propagate original error (timeout vs abort)
      await sleepWithSignal(this.intervalMs, signal);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.maxTokens);
    this.lastRefill = now;
  }
}

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export class Transport {
  private readonly baseUrl: string;
  private readonly defaults: {
    apiKey: string;
    account: string;
    user: string;
    agentId: string;
    timeout: number;
    maxRetries: number;
  };
  private readonly logger?: Logger;
  private readonly rateLimiter: TokenBucket;
  private cb: CircuitBreakerState | null;

  constructor(config: OVAdapterConfig, logger?: Logger) {
    this.baseUrl = config.endpoint.replace(/\/+$/, "");
    this.defaults = {
      apiKey: config.apiKey,
      account: config.account,
      user: config.user,
      agentId: config.agentId ?? "pi",
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    };
    this.logger = logger;
    this.rateLimiter = new TokenBucket(config.rateLimitPerSecond ?? 0);
    this.cb = config.circuitBreaker
      ? createCircuitBreaker(
          config.circuitBreaker.threshold,
          config.circuitBreaker.resetTimeoutMs,
          config.circuitBreaker.maxResetTimeoutMs,
        )
      : null;
  }

  async request<T>(
    methodLabel: string,
    path: string,
    opts?: RequestOptions,
    signal?: AbortSignal,
  ): Promise<T> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    const method = opts?.method ?? "GET";
    const body = opts?.body;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.defaults.apiKey,
      "X-OpenViking-Account": this.defaults.account,
      "X-OpenViking-User": this.defaults.user,
      "X-OpenViking-Agent": this.defaults.agentId,
      ...opts?.headers,
    };

    const maxRetries = this.defaults.maxRetries;
    const requestTimeout = opts?.timeout ?? this.defaults.timeout;
    let lastError: Error | null = null;
    let status: number | null = null;

    // Circuit breaker check — reject fast if OPEN (with lazy TICK for automatic recovery)
    if (this.cb && !allowsRequest(this.cb)) {
      // Lazy TICK: if resetTimeout has elapsed, transition to HALF_OPEN for probe
      if (
        this.cb.openSince !== null &&
        Date.now() - this.cb.openSince >= this.cb.resetTimeoutMs
      ) {
        this.cb = circuitBreakerReducer(this.cb, { type: "TICK", now: Date.now() });
        this.logger?.debug(
          `[${methodLabel}] ${method} ${path} -> PROBE (circuit breaker HALF_OPEN)`,
        );
      } else {
        this.logger?.debug(
          `[${methodLabel}] ${method} ${path} -> REJECTED (circuit breaker OPEN)`,
        );
        throw new ConnectionError(
          `[${methodLabel}] Circuit breaker OPEN — request rejected`,
        );
      }
    }

    // Acquire rate-limit token before sending
    try {
      await this.rateLimiter.acquire(signal);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "TimeoutError") {
          throw toDomainError(503, { message: `Rate limit wait timed out after ${requestTimeout}ms` }, methodLabel);
        }
        // AbortError or external abort — convert to ConnectionError for graceful handling upstream
        throw new ConnectionError(
          `[${methodLabel}] Request aborted — ${(err as Error).message ?? "cancelled"}`,
        );
      }
      throw err;
    }

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const abortController = new AbortController();
          const timeoutId = setTimeout(
            () => abortController.abort(new DOMException("Timeout", "TimeoutError")),
            requestTimeout,
          );

          let combinedSignal: AbortSignal;
          if (signal) {
            if (signal.aborted) {
              abortController.abort(signal.reason);
            } else {
              const onAbort = () => {
                abortController.abort(signal.reason);
                signal.removeEventListener("abort", onAbort);
              };
              signal.addEventListener("abort", onAbort, { once: true });
            }
            combinedSignal = abortController.signal;
          } else {
            combinedSignal = abortController.signal;
          }

          const response = await fetch(url, {
            method,
            headers,
            body,
            signal: combinedSignal,
          });

          clearTimeout(timeoutId);
          status = response.status;

          if (!response.ok) {
            let responseBody: unknown;
            try {
              const parsed = await response.json() as Record<string, unknown>;
              // Unwrap OV envelope: extract error field for better messages
              if (parsed && typeof parsed === "object" && "status" in parsed && "result" in parsed) {
                responseBody = parsed.error ?? parsed;
              } else {
                responseBody = parsed;
              }
            } catch {
              responseBody = { message: await response.text().catch(() => "") };
            }

            if (response.status >= 400 && response.status < 500) {
              // 4xx — client error, don't feed to CB
              throw toDomainError(response.status, responseBody as Record<string, unknown>, methodLabel);
            }

            // 5xx — feed to CB
            if (this.cb) {
              this.cb = circuitBreakerReducer(this.cb, { type: "RECORD_FAILURE", now: Date.now() });
            }

            if (attempt < maxRetries) {
              lastError = toDomainError(response.status, responseBody as Record<string, unknown>, methodLabel);
              await sleepWithSignal(Math.pow(2, attempt) * 1000, signal);
              continue;
            }

            throw toDomainError(response.status, responseBody as Record<string, unknown>, methodLabel);
          }

          // Success — reset CB fail count
          if (this.cb) {
            this.cb = circuitBreakerReducer(this.cb, { type: "RECORD_SUCCESS" });
          }

          const text = await response.text();
          if (!text) return undefined as T;
          const parsed = JSON.parse(text) as Record<string, unknown>;

          // Unwrap OV envelope: { status, result, error, telemetry }
          // Detection: envelope has both status ("ok"|"error") and result keys
          if (
            parsed &&
            typeof parsed === "object" &&
            "status" in parsed &&
            "result" in parsed
          ) {
            if (parsed.status === "error") {
              const errBody = parsed.error ?? {};
              throw toDomainError(response.status, errBody as Record<string, unknown>, methodLabel);
            }
            // status === "ok" — return result (or null/undefined if absent)
            return parsed.result as T;
          }

          // Bare response (no envelope) — return as-is
          return parsed as T;
        } catch (err: unknown) {
          if (err instanceof DOMException || (err instanceof Error && err.name === "AbortError")) {
            if (err.name === "TimeoutError" || (err as Error).message === "Timeout") {
              // Timeout — feed to CB
              if (this.cb) {
                this.cb = circuitBreakerReducer(this.cb, { type: "RECORD_FAILURE", now: Date.now() });
              }
              if (attempt < maxRetries) {
                lastError = err as Error;
                await sleepWithSignal(Math.pow(2, attempt) * 1000, signal);
                continue;
              }
              throw toDomainError(503, { message: `Timeout after ${requestTimeout}ms` }, methodLabel);
            }
            throw err;
          }

          if (
            err instanceof TypeError ||
            (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ECONNREFUSED")
          ) {
            // Network error — feed to CB
            if (this.cb) {
              this.cb = circuitBreakerReducer(this.cb, { type: "RECORD_FAILURE", now: Date.now() });
            }
            if (attempt < maxRetries) {
              lastError = new ConnectionError(`Network error — ${(err as Error).message}`);
              await sleepWithSignal(Math.pow(2, attempt) * 1000, signal);
              continue;
            }
            throw new ConnectionError(
              `[${methodLabel}] Cannot reach OV at ${this.baseUrl} — ${(err as Error).message}`,
            );
          }

          // Already a typed DomainError — propagate immediately
          if (err instanceof DomainError) {
            throw err;
          }

          // Unknown error — feed to CB
          if (this.cb) {
            this.cb = circuitBreakerReducer(this.cb, { type: "RECORD_FAILURE", now: Date.now() });
          }
          if (attempt < maxRetries) {
            lastError = err as Error;
            await sleepWithSignal(Math.pow(2, attempt) * 1000, signal);
            continue;
          }
          this.logger?.debug(`[${methodLabel}] Raw error: ${(err as Error).message}`, { stack: (err as Error).stack });
          throw new ConnectionError(`[${methodLabel}] Unexpected error — ${(err as Error).message}`);
        }
      }

      throw lastError ?? new ConnectionError(`[${methodLabel}] Request failed`);
    } finally {
      this.logger?.debug(
        `[${methodLabel}] ${method} ${path} -> ${status ?? "ERROR"} ${Date.now() - startTime}ms`,
      );
    }
  }

  /** Returns true when the circuit breaker is OPEN (reject fast). */
  isCircuitBreakerOpen(): boolean {
    return this.cb !== null && !allowsRequest(this.cb);
  }
}

