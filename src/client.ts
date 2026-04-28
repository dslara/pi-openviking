export class OVError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'OVError';
  }
}

export class OVNotFoundError extends OVError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'OVNotFoundError';
  }
}

export class OVUnavailableError extends OVError {
  constructor(message: string) {
    super(message, 503);
    this.name = 'OVUnavailableError';
  }
}

export class OVTimeoutError extends OVError {
  constructor(message: string) {
    super(message, 408);
    this.name = 'OVTimeoutError';
  }
}

export class OVServerError extends OVError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'OVServerError';
  }
}

interface RequestOptions {
  retries?: number;
  timeout?: number;
}

export class OVClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<unknown> {
    const { retries = 3, timeout = 10000 } = options;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.attemptRequest(method, path, body, timeout);
      } catch (err) {
        lastError = err as Error;
        if (!this.isRetryable(err as Error) || attempt >= retries) {
          break;
        }
        const delay = this.backoffDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw this.normalizeError(lastError!);
  }

  private async attemptRequest(
    method: string,
    path: string,
    body: unknown,
    timeout: number
  ): Promise<unknown> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private isRetryable(err: Error): boolean {
    if (err.message.startsWith('HTTP 503') || err.message.startsWith('HTTP 504') || err.message.startsWith('HTTP 429')) {
      return true;
    }
    if (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('Network')) {
      return true;
    }
    return false;
  }

  private backoffDelay(attempt: number): number {
    const base = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000;
    return base + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeError(err: Error): OVError {
    const statusMatch = err.message.match(/HTTP (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

    if (err.name === 'AbortError') {
      return new OVTimeoutError('Request timed out');
    }
    if (status === 404) {
      return new OVNotFoundError(err.message);
    }
    if (status === 503) {
      return new OVUnavailableError(err.message);
    }
    if (status && status >= 500) {
      return new OVServerError(err.message, status);
    }
    return new OVError(err.message, status);
  }

  // Convenience methods
  async search(query: string, limit = 10): Promise<unknown> {
    return this.request('POST', '/search/find', { query, limit });
  }

  async read(id: string): Promise<unknown> {
    return this.request('GET', `/content/read?id=${encodeURIComponent(id)}`);
  }

  async abstract(id: string): Promise<unknown> {
    return this.request('GET', `/content/abstract?id=${encodeURIComponent(id)}`);
  }

  async overview(id: string): Promise<unknown> {
    return this.request('GET', `/content/overview?id=${encodeURIComponent(id)}`);
  }

  async list(path: string): Promise<unknown> {
    return this.request('GET', `/fs/ls?path=${encodeURIComponent(path)}`);
  }

  async commit(sessionId: string): Promise<unknown> {
    return this.request('POST', `/sessions/${sessionId}/commit`);
  }

  async getSessionContext(sessionId: string): Promise<unknown> {
    return this.request('GET', `/sessions/${sessionId}/context`);
  }

  async getOrCreateSession(name: string): Promise<unknown> {
    try {
      return await this.request('GET', `/sessions?name=${encodeURIComponent(name)}`);
    } catch (err) {
      if (err instanceof OVNotFoundError) {
        return this.request('POST', '/sessions', { name });
      }
      throw err;
    }
  }

  async syncMessage(sessionId: string, parts: unknown[]): Promise<unknown> {
    return this.request('POST', `/sessions/${sessionId}/messages`, { parts });
  }
}
