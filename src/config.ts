import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ResolvedConfig {
  server: { url: string; apiKey?: string };
  vlm: { provider: string; model: string; apiKey: string; apiBase: string };
  embedding: { provider: string; model: string; apiBase: string };
  agentId: string;
  sync: { autoSync: boolean; extractMemory: boolean; commitThreshold: number };
  context: { autoInject: boolean };
}

interface RawConfig {
  agentId?: string;
  server?: { url?: string; apiKey?: string };
  vlm?: { provider?: string; model?: string; apiKey?: string; apiBase?: string };
  embedding?: { provider?: string; model?: string; apiBase?: string };
  sync?: { autoSync?: boolean; extractMemory?: boolean; commitThreshold?: number };
  context?: { autoInject?: boolean };
}

export class ConfigResolver {
  load(): ResolvedConfig {
    const cwd = process.cwd();
    const raw = this.loadRaw(cwd);

    const apiKey = raw.vlm?.apiKey ?? process.env.KIMI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error('KIMI_API_KEY is required. Set it as an environment variable or in your openviking.json.');
    }

    return {
      server: {
        url: raw.server?.url ?? 'http://localhost:1933',
        apiKey: raw.server?.apiKey,
      },
      vlm: {
        provider: 'kimi',
        model: raw.vlm?.model ?? process.env.KIMI_MODEL ?? 'kimi-k1.5',
        apiKey,
        apiBase: raw.vlm?.apiBase ?? '',
      },
      embedding: {
        provider: 'openai',
        model: raw.embedding?.model ?? 'nomic-embed-text',
        apiBase: raw.embedding?.apiBase ?? 'http://ollama:11434/v1',
      },
      agentId: raw.agentId ?? this.fallbackAgentId(cwd),
      sync: {
        autoSync: raw.sync?.autoSync ?? true,
        extractMemory: raw.sync?.extractMemory ?? true,
        commitThreshold: raw.sync?.commitThreshold ?? 10,
      },
      context: {
        autoInject: raw.context?.autoInject ?? false,
      },
    };
  }

  private loadRaw(cwd: string): RawConfig {
    const globalPath = path.join(os.homedir(), '.pi', 'openviking.json');
    const localPath = path.join(cwd, 'openviking.json');

    let raw: RawConfig = {};
    raw = this.merge(raw, this.readJson(globalPath));
    raw = this.merge(raw, this.readJson(localPath));

    if (process.env.OV_AGENT_ID) {
      raw.agentId = process.env.OV_AGENT_ID;
    }
    if (process.env.OV_SERVER_URL) {
      raw.server = { ...raw.server, url: process.env.OV_SERVER_URL };
    }
    if (process.env.KIMI_API_KEY) {
      raw.vlm = { ...raw.vlm, apiKey: process.env.KIMI_API_KEY };
    }
    if (process.env.KIMI_MODEL) {
      raw.vlm = { ...raw.vlm, model: process.env.KIMI_MODEL };
    }

    return raw;
  }

  private readJson(filePath: string): RawConfig {
    if (!fs.existsSync(filePath)) return {};
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as RawConfig;
    } catch {
      return {};
    }
  }

  private merge(base: RawConfig, override: RawConfig): RawConfig {
    return {
      agentId: override.agentId ?? base.agentId,
      server: override.server ? { ...base.server, ...override.server } : base.server,
      vlm: override.vlm ? { ...base.vlm, ...override.vlm } : base.vlm,
      embedding: override.embedding ? { ...base.embedding, ...override.embedding } : base.embedding,
      sync: override.sync ? { ...base.sync, ...override.sync } : base.sync,
      context: override.context ? { ...base.context, ...override.context } : base.context,
    };
  }

  generateOvConf(config: ResolvedConfig) {
    return {
      server: {
        url: config.server.url,
        ...(config.server.apiKey ? { api_key: config.server.apiKey } : {}),
      },
      vlm: {
        provider: config.vlm.provider,
        model: config.vlm.model,
        api_key: config.vlm.apiKey,
        ...(config.vlm.apiBase ? { api_base: config.vlm.apiBase } : {}),
      },
      embedding: {
        provider: config.embedding.provider,
        model: config.embedding.model,
        api_base: config.embedding.apiBase,
      },
      agent_id: config.agentId,
    };
  }

  private fallbackAgentId(cwd: string): string {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name) return pkg.name;
      } catch {
        // ignore malformed package.json
      }
    }
    return path.basename(cwd);
  }
}
