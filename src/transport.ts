export class OpenVikingError extends Error {
  constructor(method: string, message: string) {
    super(`OpenViking ${method} failed: ${message}`);
  }
}

export interface TransportConfig {
  endpoint: string;
  timeout: number;
  apiKey: string;
  account: string;
  user: string;
}

export interface Transport {
  request(
    methodLabel: string,
    path: string,
    opts?: {
      httpMethod?: string;
      body?: unknown;
      timeout?: number;
    },
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export function createTransport(config: TransportConfig): Transport {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": config.apiKey,
    "X-OpenViking-Account": config.account,
    "X-OpenViking-User": config.user,
  };

  return {
    async request(methodLabel, path, opts, signal) {
      const controller = new AbortController();
      const timeoutMs = opts?.timeout ?? config.timeout;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      const httpMethod = opts?.httpMethod ?? (opts?.body ? "POST" : "GET");

      try {
        const res = await fetch(`${config.endpoint}${path}`, {
          method: httpMethod,
          headers,
          body: opts?.body ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });

        const json = (await res.json()) as {
          status: string;
          result?: unknown;
          error?: { code: string; message: string };
        };

        if (!res.ok) {
          const errMsg = json.error?.message ?? `HTTP ${res.status}`;
          throw new OpenVikingError(methodLabel, `${errMsg} (HTTP ${res.status})`);
        }

        return json.result;
      } catch (err) {
        if (err instanceof OpenVikingError) throw err;
        if (controller.signal.aborted) {
          if (signal?.aborted) {
            throw new OpenVikingError(methodLabel, "request aborted");
          }
          throw new OpenVikingError(methodLabel, "request timed out");
        }
        throw new OpenVikingError(methodLabel, (err as Error).message);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
