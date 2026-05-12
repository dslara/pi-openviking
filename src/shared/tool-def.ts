import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TSchema, Static } from "typebox";
import type { OpenVikingClient } from "../ov-client/client";
import type { SessionSyncLike } from "../session-sync/session";

export interface ToolRegisterDeps {
  client: OpenVikingClient;
  sync: SessionSyncLike;
  [key: string]: unknown;
}

export type ToolDeps = Record<string, unknown>;

export interface ExecuteArgs<P extends TSchema, D extends ToolDeps> {
  params: Static<P>;
  deps: D;
  signal?: AbortSignal;
  onUpdate?: ((result: any) => void);
  ctx?: unknown;
}

export interface ToolDef<P extends TSchema, D extends ToolDeps> {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines?: string[];
  parameters: P;
  validateUri?: boolean;
  execute: (args: ExecuteArgs<P, D>) => Promise<{
    text: string;
    details?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

export function defineTool<P extends TSchema, D extends ToolDeps>(
  pi: ExtensionAPI,
  deps: D,
  def: ToolDef<P, D>,
): void {
  pi.registerTool({
    name: def.name,
    label: def.label,
    description: def.description,
    promptSnippet: def.promptSnippet,
    promptGuidelines: def.promptGuidelines,
    parameters: def.parameters,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      try {
        if (def.validateUri) {
          const uri = (params as Record<string, unknown>).uri as string | undefined;
          if (!uri || !uri.startsWith("viking://")) {
            return {
              content: [{ type: "text", text: "Invalid URI: must start with viking://" }],
              details: {},
              isError: true,
            };
          }
        }

        const result = await def.execute({
          params: params as Static<P>,
          deps,
          signal,
          onUpdate: onUpdate as any,
          ctx,
        });

        return {
          content: [{ type: "text", text: result.text }],
          details: result.details ?? {},
          isError: result.isError,
        };
      } catch (err) {
        const msg = (err as Error).message;
        return {
          content: [{ type: "text", text: msg }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
