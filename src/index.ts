import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigResolver } from './config';
import { OVClient } from './client';
import { QueryTool } from './query-tool';
import { DockerManager } from './docker';
import { SessionSync } from './session-sync';
import { AutoCommit } from './auto-commit';

export interface ExtensionAPI {
  registerTool(tool: {
    name: string;
    description: string;
    parameters?: unknown;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }): void;
  registerCommand(
    name: string,
    options: {
      description: string;
      handler: (args: string, ctx: ExtensionContext) => Promise<void>;
    }
  ): void;
  on(
    event: string,
    handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown | void>
  ): void;
  appendEntry(customType: string, data?: unknown): void;
  ui: {
    confirm(message: string): Promise<boolean>;
    notify(message: string): void;
  };
  exec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

interface ExtensionContext {
  sessionManager: {
    getSessionFile(): string | undefined;
    getBranch(): Array<{
      type: string;
      customType?: string;
      data?: unknown;
      message?: {
        role: string;
        content: unknown;
      };
    }>;
  };
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

  const stateFilePath = path.join(os.homedir(), '.pi', 'openviking-state.json');
  let sessionSync: SessionSync | undefined;
  let autoCommit: AutoCommit | undefined;

  pi.on('session_start', async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    const ephemeral = !sessionFile;

    const branch = ctx.sessionManager.getBranch();
    const stateEntry = [...branch]
      .reverse()
      .find(
        (e) =>
          e.type === 'custom' &&
          e.customType === 'openviking-state' &&
          (e.data as Record<string, unknown> | undefined)?.agent_id === config.agentId
      );
    const restoredId = (stateEntry?.data as Record<string, string> | undefined)?.session_id;

    sessionSync = new SessionSync({
      agentId: config.agentId,
      client,
      stateFilePath,
      notify: pi.ui.notify,
      ephemeral,
    });

    if (restoredId) {
      sessionSync.restoreSessionId(restoredId);
    } else {
      await sessionSync.initialize().catch(() => {
        pi.ui.notify('OpenViking session init failed.');
      });
    }

    autoCommit = new AutoCommit({
      client,
      getSessionId: () => sessionSync?.getSessionId(),
      threshold: config.sync.commitThreshold,
      notify: pi.ui.notify,
    });

    if (!ephemeral && sessionSync.getSessionId()) {
      pi.appendEntry('openviking-state', {
        session_id: sessionSync.getSessionId(),
        agent_id: config.agentId,
      });
    }
  });

  pi.on('turn_end', async (event, ctx) => {
    if (!sessionSync?.getSessionId()) return;

    try {
      const branch = ctx.sessionManager.getBranch();
      const userEntry = [...branch]
        .reverse()
        .find((e) => e.type === 'message' && e.message?.role === 'user');
      const assistantEntry = [...branch]
        .reverse()
        .find((e) => e.type === 'message' && e.message?.role === 'assistant');

      if (userEntry?.message) {
        const text = extractText(userEntry.message.content);
        if (text) await sessionSync.syncUserMessage(text);
      }

      if (assistantEntry?.message) {
        const text = extractText(assistantEntry.message.content);
        const toolResults = (event as { toolResults?: Array<{ toolCallId: string; content: unknown }> }).toolResults ?? [];
        const toolCalls = extractToolCalls(assistantEntry.message.content, toolResults);
        if (text || toolCalls.length) {
          await sessionSync.syncAssistantMessage(text || '', toolCalls.length ? toolCalls : undefined);
        }
      }

      autoCommit?.handleTurn();
    } catch (err) {
      pi.ui.notify(`OpenViking sync error: ${(err as Error).message}`);
    }
  });

  pi.on('session_shutdown', async () => {
    const sessionId = sessionSync?.getSessionId();
    if (sessionId) {
      pi.appendEntry('openviking-state', {
        session_id: sessionId,
        agent_id: config.agentId,
      });
    }
  });

  pi.registerCommand('ov-commit', {
    description: 'Manually trigger OpenViking session commit',
    handler: async () => {
      autoCommit?.forceCommit();
    },
  });
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  return '';
}

function extractToolCalls(
  content: unknown,
  toolResults: Array<{ toolCallId: string; content: unknown }>
): Array<{ tool_name: string; arguments: Record<string, unknown>; result_summary?: string }> {
  if (!Array.isArray(content)) return [];
  const calls: Array<{ tool_name: string; arguments: Record<string, unknown>; result_summary?: string }> = [];
  for (const block of content) {
    if ((block as any).type === 'toolCall') {
      const result = toolResults.find((r) => r.toolCallId === (block as any).id);
      const resultText = result ? extractText(result.content) : '';
      calls.push({
        tool_name: (block as any).name,
        arguments: (block as any).arguments,
        result_summary: resultText || undefined,
      });
    }
  }
  return calls;
}
