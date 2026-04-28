import { ConfigResolver } from './config';
import { OVClient } from './client';
import { QueryTool } from './query-tool';
import { DockerManager } from './docker';

// Minimal ExtensionAPI interface for typing without the full Pi SDK
export interface ExtensionAPI {
  registerTool(tool: {
    name: string;
    description: string;
    parameters?: unknown;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }): void;
  ui: {
    confirm(message: string): Promise<boolean>;
    notify(message: string): void;
  };
  exec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

export default function piOpenvikingExtension(pi: ExtensionAPI): void {
  const config = new ConfigResolver().load();
  const client = new OVClient(config.server.url, config.server.apiKey);
  const queryTool = new QueryTool(client);

  pi.registerTool({
    name: queryTool.name,
    description: queryTool.description,
    parameters: queryTool.schema,
    execute: (args) => queryTool.execute(args as import('./query-tool').QueryParams),
  });

  const docker = new DockerManager({
    exec: pi.exec,
    confirm: pi.ui.confirm,
    notify: pi.ui.notify,
  });

  docker.ensureRunning('openviking').catch(() => {
    pi.ui.notify('OpenViking container check failed.');
  });
  docker.ensureRunning('ollama').catch(() => {
    pi.ui.notify('Ollama container check failed.');
  });
}
