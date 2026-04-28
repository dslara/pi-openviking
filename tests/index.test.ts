import { describe, it, expect, vi } from 'vitest';
import piOpenvikingExtension from '../src/index';

describe('piOpenvikingExtension', () => {
  const createPi = () => {
    const handlers: Record<string, Function> = {};
    const on = vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    });
    return {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on,
      appendEntry: vi.fn(),
      handlers,
      ui: {
        confirm: vi.fn().mockResolvedValue(true),
        notify: vi.fn(),
      },
      exec: vi.fn().mockImplementation((_cmd, args) => {
        if (args[0] === 'ps') return Promise.resolve({ stdout: '', stderr: '' });
        if (args[0] === 'start') return Promise.resolve({ stdout: '', stderr: '' });
        return Promise.resolve({ stdout: '', stderr: '' });
      }),
    };
  };

  it('registers ov_query tool on startup', () => {
    const pi = createPi();
    const originalKey = process.env.KIMI_API_KEY;
    process.env.KIMI_API_KEY = 'test-key';

    piOpenvikingExtension(pi);

    expect(pi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ov_query',
        description: expect.stringContaining('OpenViking'),
      })
    );

    if (originalKey === undefined) {
      delete process.env.KIMI_API_KEY;
    } else {
      process.env.KIMI_API_KEY = originalKey;
    }
  });

  it('registers session lifecycle handlers and /ov-commit command', () => {
    const pi = createPi();
    const originalKey = process.env.KIMI_API_KEY;
    process.env.KIMI_API_KEY = 'test-key';

    piOpenvikingExtension(pi);

    expect(pi.on).toHaveBeenCalledWith('session_start', expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith('turn_end', expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith('session_shutdown', expect.any(Function));
    expect(pi.registerCommand).toHaveBeenCalledWith(
      'ov-commit',
      expect.objectContaining({ description: expect.stringContaining('commit') })
    );

    if (originalKey === undefined) {
      delete process.env.KIMI_API_KEY;
    } else {
      process.env.KIMI_API_KEY = originalKey;
    }
  });

  it('turn_end handler syncs user and assistant messages', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'ov-sess-1' }),
    } as Response) as unknown as typeof fetch;

    const pi = createPi();
    const originalKey = process.env.KIMI_API_KEY;
    process.env.KIMI_API_KEY = 'test-key';

    piOpenvikingExtension(pi);

    const sessionStartHandler = pi.handlers['session_start'];
    const turnEndHandler = pi.handlers['turn_end'];
    expect(sessionStartHandler).toBeDefined();
    expect(turnEndHandler).toBeDefined();

    const ctx = {
      sessionManager: {
        getSessionFile: vi.fn().mockReturnValue('/tmp/session.jsonl'),
        getBranch: vi.fn().mockReturnValue([
          { type: 'message', message: { role: 'user', content: 'Hello' } },
          {
            type: 'message',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Hi there' },
                { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'ls' } },
              ],
            },
          },
        ]),
      },
    };

    await sessionStartHandler({ reason: 'startup' }, ctx);

    await turnEndHandler(
      { toolResults: [{ toolCallId: 'call-1', content: 'file.txt' }] },
      ctx
    );

    expect(pi.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining('sync error'));

    global.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.KIMI_API_KEY;
    } else {
      process.env.KIMI_API_KEY = originalKey;
    }
  });
});
