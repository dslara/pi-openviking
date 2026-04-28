import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { ConfigResolver } from '../src/config';

describe('ConfigResolver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { KIMI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses cwd basename as agentId when no other sources exist', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const resolver = new ConfigResolver();
    const config = resolver.load();

    expect(config.agentId).toBe('my-project');
  });

  it('prefers package.json name over cwd basename', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('package.json')) return true;
      return false;
    });
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ name: 'cool-app' })
    );

    const resolver = new ConfigResolver();
    const config = resolver.load();

    expect(config.agentId).toBe('cool-app');
  });

  it('prefers env var OV_AGENT_ID over all other sources', () => {
    process.env.OV_AGENT_ID = 'env-agent';
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('package.json')) return true;
      return false;
    });
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ name: 'cool-app' })
    );

    const resolver = new ConfigResolver();
    const config = resolver.load();

    expect(config.agentId).toBe('env-agent');
  });

  it('loads agentId and server url from local openviking.json', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p !== 'string') return false;
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('openviking.json')) return true;
      return false;
    });
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('package.json')) {
        return JSON.stringify({ name: 'pkg-name' });
      }
      if (typeof p === 'string' && p.endsWith('openviking.json')) {
        return JSON.stringify({ agentId: 'local-agent', server: { url: 'http://custom:9999' } });
      }
      return '';
    });

    const resolver = new ConfigResolver();
    const config = resolver.load();

    expect(config.agentId).toBe('local-agent');
    expect(config.server.url).toBe('http://custom:9999');
  });

  it('loads from global ~/.pi/openviking.json when local file missing', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p !== 'string') return false;
      if (p.endsWith('package.json')) return true;
      if (p.includes('.pi') && p.endsWith('openviking.json')) return true;
      return false;
    });
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('package.json')) {
        return JSON.stringify({ name: 'pkg-name' });
      }
      if (typeof p === 'string' && p.includes('.pi') && p.endsWith('openviking.json')) {
        return JSON.stringify({ agentId: 'global-agent' });
      }
      return '';
    });

    const resolver = new ConfigResolver();
    const config = resolver.load();

    expect(config.agentId).toBe('global-agent');
  });

  it('throws clear error when KIMI_API_KEY is missing', () => {
    delete process.env.KIMI_API_KEY;
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const resolver = new ConfigResolver();

    expect(() => resolver.load()).toThrow('KIMI_API_KEY');
  });

  it('generateOvConf produces valid OpenViking config JSON', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/home/user/my-project');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const resolver = new ConfigResolver();
    const config = resolver.load();
    const ov = resolver.generateOvConf(config);

    expect(ov.vlm.provider).toBe('kimi');
    expect(ov.vlm.model).toBe('kimi-k1.5');
    expect(ov.vlm.api_key).toBe('test-key');
    expect(ov.embedding.provider).toBe('openai');
    expect(ov.embedding.model).toBe('nomic-embed-text');
    expect(ov.embedding.api_base).toBe('http://ollama:11434/v1');
    expect(ov.agent_id).toBe('my-project');
  });
});
