import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent, ImageContent, ThinkingContent, ToolCall } from "@mariozechner/pi-ai";
import type { CommitResult, OpenVikingClient } from "./features/ov-client/client";
import { logger } from "./shared/logger";

export interface SessionSyncOpts {
  getSessionFile: () => string | undefined;
  getBranch: () => Array<{ type: string; customType?: string; data?: unknown }>;
  appendEntry: (type: string, data: unknown) => void;
}

export interface SessionSyncLike {
  getOvSessionId(): string | undefined;
  flush(): Promise<void>;
  commit(): Promise<import("./features/ov-client/client").CommitResult>;
}

export class SessionSync implements SessionSyncLike {
  private client: OpenVikingClient;
  private opts: SessionSyncOpts;
  private ovSessionId: string | undefined;
  private pendingChain: Promise<void> = Promise.resolve();

  constructor(client: OpenVikingClient, opts: SessionSyncOpts) {
    this.client = client;
    this.opts = opts;
  }

  onSessionStart(): void {
    // Walk branch leaf-to-root to find persisted ov-session mapping
    const branch = this.opts.getBranch();
    for (let i = branch.length - 1; i >= 0; i--) {
      const entry = branch[i];
      if (entry.type === "custom" && (entry as any).customType === "ov-session") {
        this.ovSessionId = (entry as any).data?.ovSessionId as string;
        return;
      }
    }
  }

  onMessageEnd(message: AgentMessage): void {
    if (!("content" in message)) return;
    if (message.role !== "user" && message.role !== "assistant") return;

    const text = this.extractText(message.content);
    if (!text) return;

    const role = message.role;
    void this.enqueue(async () => {
      try {
        if (!this.ovSessionId) {
          this.ovSessionId = await this.client.createSession();
          logger.debug("session created:", this.ovSessionId);
          if (this.opts.getSessionFile() != null) {
            this.opts.appendEntry("ov-session", { ovSessionId: this.ovSessionId });
          }
        }
        await this.client.sendMessage(this.ovSessionId!, role, text);
        logger.debug("message sent:", role, text.length);
      } catch (err) {
        // OV server down — silently drop to avoid crashing Pi
        logger.error("message send failed:", (err as Error).message);
      }
    });
  }

  getOvSessionId(): string | undefined {
    return this.ovSessionId;
  }

  async commit(): Promise<CommitResult> {
    if (!this.ovSessionId) {
      throw new Error("No OpenViking session mapped");
    }
    const result = await this.client.commit(this.ovSessionId);
    logger.debug("commit:", this.ovSessionId, result.task_id);
    return result;
  }

  flush(): Promise<void> {
    return this.pendingChain;
  }

  onShutdown(): void {
    this.pendingChain = Promise.resolve();
    this.ovSessionId = undefined;
  }

  private extractText(content: string | (TextContent | ImageContent | ThinkingContent | ToolCall)[]): string | undefined {
    if (typeof content === "string") return content || undefined;
    const parts = content
      .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text);
    const joined = parts.join("");
    return joined || undefined;
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.pendingChain = this.pendingChain.then(fn, fn);
    return this.pendingChain;
  }
}
