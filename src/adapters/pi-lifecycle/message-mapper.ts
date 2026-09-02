import type { Part, ToolPart } from "../../domain/common/part";

export interface MessageInput {
  role: string;
  content?: string | Array<{ type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

function toToolPart(defaults: Partial<ToolPart>): ToolPart {
  return {
    type: "tool",
    toolId: "",
    toolName: "",
    toolInput: {},
    toolOutput: "",
    toolStatus: "pending",
    toolOutputTruncated: false,
    toolUri: "",
    skillUri: "",
    durationMs: null,
    promptTokens: null,
    completionTokens: null,
    toolOutputRef: "",
    ...defaults,
  };
}

function contentItemsToText(items: Array<{ type: string; text?: string }>): string {
  return items
    .filter((i) => i.type === "text" && i.text != null)
    .map((i) => i.text!)
    .join("\n");
}

export function agentMessageToParts(msg: MessageInput): Part[] {
  const parts: Part[] = [];

  // ── toolResult role ────────────────────────────────────────────────────────
  if (msg.role === "toolResult") {
    const content = Array.isArray(msg.content) ? msg.content : [];
    const toolOutput = contentItemsToText(content);
    parts.push(
      toToolPart({
        toolId: msg.toolCallId ?? "",
        toolName: msg.toolName ?? "",
        toolOutput,
        toolStatus: msg.isError ? "error" : "success",
      }),
    );
    return parts;
  }

  // ── Only user and assistant roles are synced beyond this point ─────────
  if (msg.role !== "user" && msg.role !== "assistant") {
    return [];
  }

  if (msg.content != null && typeof msg.content === "string") {
    if (msg.content.trim().length > 0) {
      parts.push({ type: "text", text: msg.content });
    }
  } else if (Array.isArray(msg.content)) {
    for (const item of msg.content) {
      if (item.type === "text" && item.text && item.text.trim().length > 0) {
        parts.push({ type: "text", text: item.text });
      } else if (item.type === "toolCall" && item.id) {
        parts.push(
          toToolPart({
            toolId: item.id,
            toolName: item.name ?? "",
            toolInput: (item.arguments as Record<string, unknown>) ?? {},
            toolStatus: "pending",
          }),
        );
      }
    }
  }

  return parts;
}
