import { describe, it, expect, vi } from 'vitest';
import { QueryTool } from '../src/query-tool';

describe('QueryTool', () => {
  const createClient = () =>
    ({
      search: vi.fn().mockResolvedValue({ results: [] }),
      read: vi.fn().mockResolvedValue({ content: 'hello' }),
      abstract: vi.fn().mockResolvedValue({ summary: 'short' }),
      overview: vi.fn().mockResolvedValue({ meta: {} }),
      list: vi.fn().mockResolvedValue({ items: [] }),
      getSessionContext: vi.fn().mockResolvedValue({ context: '' }),
    }) as unknown as import('../src/client').OVClient;

  it('executes search action through OVClient', async () => {
    const client = createClient();
    const tool = new QueryTool(client);

    const result = await tool.execute({ action: 'search', query: 'auth', limit: 5 });

    expect(client.search).toHaveBeenCalledWith('auth', 5);
    expect(result).toEqual({ results: [] });
  });

  it('executes read action through OVClient', async () => {
    const client = createClient();
    const tool = new QueryTool(client);

    const result = await tool.execute({ action: 'read', id: 'doc-1' });

    expect(client.read).toHaveBeenCalledWith('doc-1');
    expect(result).toEqual({ content: 'hello' });
  });

  it('executes session_context action through OVClient', async () => {
    const client = createClient();
    const tool = new QueryTool(client);

    const result = await tool.execute({ action: 'session_context', id: 'sess-1' });

    expect(client.getSessionContext).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ context: '' });
  });
});
