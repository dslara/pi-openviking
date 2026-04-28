import { describe, it, expect, vi } from 'vitest';
import piOpenvikingExtension from '../src/index';

describe('piOpenvikingExtension', () => {
  const createPi = () => ({
    registerTool: vi.fn(),
    ui: {
      confirm: vi.fn().mockResolvedValue(true),
      notify: vi.fn(),
    },
    exec: vi.fn().mockImplementation((_cmd, args) => {
      if (args[0] === 'ps') return Promise.resolve({ stdout: '', stderr: '' });
      if (args[0] === 'start') return Promise.resolve({ stdout: '', stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    }),
  });

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
});
