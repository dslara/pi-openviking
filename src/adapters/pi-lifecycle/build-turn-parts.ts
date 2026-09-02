import type { Part, ToolPart } from "../../domain/common/part";

export interface ToolResultInput {
  toolCallId: string;
  toolName: string;
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
}

const TOOL_OUTPUT_MAX_CHARS = 2000;

function truncateToolOutput(s: string): string {
  if (typeof s !== "string") s = String(s ?? "");
  if (s.length <= TOOL_OUTPUT_MAX_CHARS) return s;
  return (
    s.slice(0, TOOL_OUTPUT_MAX_CHARS) +
    `\n... [truncated, ${s.length - TOOL_OUTPUT_MAX_CHARS} more chars]`
  );
}

function extractContentText(content: ToolResultInput["content"]): string {
  return (content ?? [])
    .filter((i) => i.type === "text" && i.text != null)
    .map((i) => i.text!)
    .join("\n");
}

/**
 * Merge tool results into assistant message parts.
 *
 * Takes the parts extracted from an assistant message (TextParts + pending ToolParts)
 * and fills in tool output + status from tool results, matched by toolCallId.
 */
export function buildTurnParts(
  assistantParts: Part[],
  toolResults: ToolResultInput[],
): Part[] {
  // Shallow clone so we don't mutate caller's array
  const parts = assistantParts.map((p) => ({ ...p } as Part));

  for (const tr of toolResults) {
    const idx = parts.findIndex(
      (p): p is ToolPart => p.type === "tool" && p.toolId === tr.toolCallId,
    );
    if (idx === -1) continue;

    const tp = parts[idx] as ToolPart;
    const raw = extractContentText(tr.content);
    tp.toolOutput = truncateToolOutput(raw);
    tp.toolOutputTruncated = tp.toolOutput !== raw;
    tp.toolStatus = tr.isError ? "error" : "completed";
  }

  return parts;
}
