import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OVClient } from '../src/client';

describe('OVClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('makes a correct fetch call with method, path, and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'session-1' }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OVClient('http://localhost:1933');
    const result = await client.request('POST', '/sessions', { name: 'test' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1933/api/v1/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ name: 'test' }),
      })
    );
    expect(result).toEqual({ id: 'session-1' });
  });

  it('retries on 503 with exponential backoff and eventually succeeds', async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'session-2' }),
      } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OVClient('http://localhost:1933');
    const promise = client.request('GET', '/search', { q: 'test' });

    // First attempt fails immediately (network error)
    vi.advanceTimersByTime(0);
    // Wait for microtask queue to flush
    await Promise.resolve();
    // Second attempt after backoff 1s
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    // Third attempt after backoff 2s
    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    const result = await promise;
    expect(result).toEqual({ id: 'session-2' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    Math.random = originalRandom;
  });

  it('throws OVTimeoutError when request exceeds timeout', async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          const onAbort = () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OVClient('http://localhost:1933');
    await expect(client.request('GET', '/slow', undefined, { timeout: 50, retries: 0 })).rejects.toThrow('timed out');

    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('throws OVNotFoundError on 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OVClient('http://localhost:1933');
    await expect(client.request('GET', '/content/read?id=missing')).rejects.toThrow('HTTP 404');
  });

  it('throws OVServerError on 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OVClient('http://localhost:1933');
    await expect(client.request('POST', '/sessions')).rejects.toThrow('HTTP 500');
  });
});
