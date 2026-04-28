import { describe, it, expect, vi } from 'vitest';
import { AutoCommit } from '../src/auto-commit';

describe('AutoCommit', () => {
  it('fires commit after threshold turns', async () => {
    const client = {
      commit: vi.fn().mockResolvedValue({}),
    } as unknown as import('../src/client').OVClient;

    const ac = new AutoCommit({
      client,
      getSessionId: () => 'sess-1',
      threshold: 3,
      notify: vi.fn(),
    });

    ac.handleTurn();
    ac.handleTurn();
    ac.handleTurn();

    await Promise.resolve();

    expect(client.commit).toHaveBeenCalledWith('sess-1');
  });

  it('notifies on commit failure without throwing', async () => {
    const client = {
      commit: vi.fn().mockRejectedValue(new Error('OV down')),
    } as unknown as import('../src/client').OVClient;
    const notify = vi.fn();

    const ac = new AutoCommit({
      client,
      getSessionId: () => 'sess-1',
      threshold: 1,
      notify,
    });

    ac.handleTurn();
    await new Promise((r) => setTimeout(r, 10));

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed'));
  });

  it('forceCommit triggers commit immediately regardless of counter', async () => {
    const client = {
      commit: vi.fn().mockResolvedValue({}),
    } as unknown as import('../src/client').OVClient;

    const ac = new AutoCommit({
      client,
      getSessionId: () => 'sess-1',
      threshold: 100,
      notify: vi.fn(),
    });

    ac.forceCommit();
    await new Promise((r) => setTimeout(r, 10));

    expect(client.commit).toHaveBeenCalledWith('sess-1');
  });
});
