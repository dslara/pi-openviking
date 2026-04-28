import { describe, it, expect, vi } from 'vitest';
import { SessionSync } from '../src/session-sync';

describe('SessionSync', () => {
  const createFs = (overrides?: {
    existsSync?: boolean;
    readFileSync?: string;
  }) => ({
    existsSync: vi.fn().mockReturnValue(overrides?.existsSync ?? false),
    mkdirSync: vi.fn().mockImplementation(() => undefined),
    readFileSync: vi.fn().mockReturnValue(overrides?.readFileSync ?? '{}'),
    writeFileSync: vi.fn().mockImplementation(() => undefined),
  });

  it('creates OpenViking session when no local state exists', async () => {
    const fs = createFs();
    const client = {
      getOrCreateSession: vi.fn().mockResolvedValue({ id: 'ov-sess-1' }),
    } as unknown as import('../src/client').OVClient;

    const sync = new SessionSync({
      agentId: 'my-agent',
      client,
      stateFilePath: '/home/user/.pi/openviking-state.json',
      notify: vi.fn(),
      fs: fs as unknown as typeof import('node:fs'),
    });

    await sync.initialize();

    expect(client.getOrCreateSession).toHaveBeenCalledWith('my-agent-pi-main');
    expect(sync.getSessionId()).toBe('ov-sess-1');
  });

  it('resumes session_id from local state file without calling OpenViking', async () => {
    const fs = createFs({
      existsSync: true,
      readFileSync: JSON.stringify({ sessions: { 'my-agent': 'existing-id' } }),
    });
    const client = {
      getOrCreateSession: vi.fn(),
    } as unknown as import('../src/client').OVClient;

    const sync = new SessionSync({
      agentId: 'my-agent',
      client,
      stateFilePath: '/home/user/.pi/openviking-state.json',
      notify: vi.fn(),
      fs: fs as unknown as typeof import('node:fs'),
    });

    await sync.initialize();

    expect(client.getOrCreateSession).not.toHaveBeenCalled();
    expect(sync.getSessionId()).toBe('existing-id');
  });

  it('skips sync entirely for ephemeral Pi sessions', async () => {
    const client = {
      getOrCreateSession: vi.fn(),
    } as unknown as import('../src/client').OVClient;

    const sync = new SessionSync({
      agentId: 'my-agent',
      client,
      stateFilePath: '/home/user/.pi/openviking-state.json',
      notify: vi.fn(),
      ephemeral: true,
    });

    await sync.initialize();

    expect(client.getOrCreateSession).not.toHaveBeenCalled();
    expect(sync.getSessionId()).toBeUndefined();
  });

  it('syncs user message as TextPart', async () => {
    const client = {
      syncMessage: vi.fn().mockResolvedValue({}),
    } as unknown as import('../src/client').OVClient;

    const sync = new SessionSync({
      agentId: 'my-agent',
      client,
      stateFilePath: '/home/user/.pi/openviking-state.json',
      notify: vi.fn(),
    });
    // @ts-expect-error private field
    sync.sessionId = 'sess-1';

    await sync.syncUserMessage('Hello world');

    expect(client.syncMessage).toHaveBeenCalledWith('sess-1', [
      { type: 'text', text: 'Hello world' },
    ]);
  });

  it('syncs assistant message with text and tool parts', async () => {
    const client = {
      syncMessage: vi.fn().mockResolvedValue({}),
    } as unknown as import('../src/client').OVClient;

    const sync = new SessionSync({
      agentId: 'my-agent',
      client,
      stateFilePath: '/home/user/.pi/openviking-state.json',
      notify: vi.fn(),
    });
    // @ts-expect-error private field
    sync.sessionId = 'sess-1';

    await sync.syncAssistantMessage('Here is the result', [
      { tool_name: 'bash', arguments: { command: 'ls' }, result_summary: 'file1 file2' },
    ]);

    expect(client.syncMessage).toHaveBeenCalledWith('sess-1', [
      { type: 'text', text: 'Here is the result' },
      { type: 'tool', tool_name: 'bash', arguments: { command: 'ls' }, result_summary: 'file1 file2' },
    ]);
  });

  it('truncates result_summary when too long', async () => {
    const client = {
      syncMessage: vi.fn().mockResolvedValue({}),
    } as unknown as import('../src/client').OVClient;

    const sync = new SessionSync({
      agentId: 'my-agent',
      client,
      stateFilePath: '/home/user/.pi/openviking-state.json',
      notify: vi.fn(),
    });
    // @ts-expect-error private field
    sync.sessionId = 'sess-1';

    const longSummary = 'a'.repeat(500);
    await sync.syncAssistantMessage('Done', [
      { tool_name: 'read', arguments: { path: 'x' }, result_summary: longSummary },
    ]);

    const call = vi.mocked(client.syncMessage).mock.calls[0] as [string, Array<{ result_summary?: string }>];
    const toolPart = call[1].find((p) => 'tool_name' in p) as { result_summary: string } | undefined;
    expect(toolPart?.result_summary?.length).toBeLessThan(500);
  });
});
