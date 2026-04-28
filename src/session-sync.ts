import * as fs from 'node:fs';
import * as path from 'node:path';
import { OVClient } from './client';

export interface SessionSyncDeps {
  agentId: string;
  client: OVClient;
  stateFilePath: string;
  notify: (message: string) => void;
  ephemeral?: boolean;
  fs?: typeof import('node:fs');
}

interface StateFile {
  sessions: Record<string, string>;
}

export class SessionSync {
  private sessionId?: string;
  private state: StateFile = { sessions: {} };
  private fs: typeof import('node:fs');

  constructor(private deps: SessionSyncDeps) {
    this.fs = deps.fs ?? fs;
  }

  async initialize(): Promise<void> {
    if (this.deps.ephemeral) {
      return;
    }
    this.loadState();
    const name = `${this.deps.agentId}-pi-main`;

    const existingId = this.state.sessions[this.deps.agentId];
    if (existingId) {
      this.sessionId = existingId;
      return;
    }

    const session = (await this.deps.client.getOrCreateSession(name)) as { id: string };
    this.sessionId = session.id;
    this.state.sessions[this.deps.agentId] = session.id;
    this.saveState();
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  restoreSessionId(id: string): void {
    this.sessionId = id;
  }

  async syncUserMessage(text: string): Promise<void> {
    if (!this.sessionId) return;
    await this.deps.client.syncMessage(this.sessionId, [
      { type: 'text', text },
    ]);
  }

  async syncAssistantMessage(
    text: string,
    toolCalls?: Array<{
      tool_name: string;
      arguments: Record<string, unknown>;
      result_summary?: string;
    }>
  ): Promise<void> {
    if (!this.sessionId) return;
    const parts: Array<{ type: string; text?: string; tool_name?: string; arguments?: Record<string, unknown>; result_summary?: string }> = [
      { type: 'text', text },
    ];
    if (toolCalls) {
      for (const tc of toolCalls) {
        parts.push({
          type: 'tool',
          tool_name: tc.tool_name,
          arguments: tc.arguments,
          ...(tc.result_summary ? { result_summary: this.truncate(tc.result_summary, 200) } : {}),
        });
      }
    }
    await this.deps.client.syncMessage(this.sessionId, parts);
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  private loadState(): void {
    if (!this.fs.existsSync(this.deps.stateFilePath)) return;
    try {
      const raw = this.fs.readFileSync(this.deps.stateFilePath, 'utf-8');
      this.state = JSON.parse(raw) as StateFile;
    } catch {
      this.state = { sessions: {} };
    }
  }

  private saveState(): void {
    const dir = path.dirname(this.deps.stateFilePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.writeFileSync(this.deps.stateFilePath, JSON.stringify(this.state, null, 2));
  }
}
