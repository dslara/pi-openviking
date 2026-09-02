export interface HealthStatus {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export class HealthCheck {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(endpoint: string, apiKey?: string) {
    this.baseUrl = endpoint.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  async check(_timeoutMs?: number): Promise<HealthStatus> {
    const overall = Date.now();

    // Prefer /api/v1/sessions with auth: /ready is known broken in current OV
    // (always returns 503 after 10s). Auth check is fast (~77ms).
    if (this.apiKey) {
      return this.trySessions(overall);
    }

    // No apiKey — try /ready (legacy, may be slow)
    return this.tryReady(overall, 3000);
  }

  private async tryReady(
    startTime: number,
    timeoutMs: number,
  ): Promise<HealthStatus> {
    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), timeoutMs);
      const response = await fetch(`${this.baseUrl}/ready`, {
        method: "GET",
        signal: ac.signal,
      });
      clearTimeout(tid);
      const latencyMs = Date.now() - startTime;
      if (response.ok) return { ok: true, latencyMs };
      return {
        ok: false,
        latencyMs,
        error: `OV /ready returned ${response.status}`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      return {
        ok: false,
        latencyMs,
        error: `OV /ready failed: ${(err as Error).message}`,
      };
    }
  }

  private async trySessions(startTime: number): Promise<HealthStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/sessions`, {
        headers: { "X-API-Key": this.apiKey! },
      });
      const latencyMs = Date.now() - startTime;
      if (response.ok) return { ok: true, latencyMs };
      return {
        ok: false,
        latencyMs,
        error: `OV /api/v1/sessions returned ${response.status}`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      return {
        ok: false,
        latencyMs,
        error: `OV /api/v1/sessions failed: ${(err as Error).message}`,
      };
    }
  }
}
