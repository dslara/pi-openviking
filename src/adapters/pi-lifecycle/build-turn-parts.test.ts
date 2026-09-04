import { describe, it, expect } from "vitest";
import { buildTurnParts } from "./build-turn-parts";
import type { Part, ToolPart, TextPart } from "../../domain/common/part";

const toolOutputMaxChars = 2000;

function textPart(text: string): TextPart {
  return { type: "text", text };
}

function pendingTool(id: string, name: string): ToolPart {
  return {
    type: "tool",
    toolId: id,
    toolName: name,
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
  };
}

function resultInput(overrides: {
  toolCallId: string;
  toolName?: string;
  isError?: boolean;
  content?: string;
}) {
  return {
    toolCallId: overrides.toolCallId,
    toolName: overrides.toolName ?? "test_tool",
    content: overrides.content
      ? [{ type: "text" as const, text: overrides.content }]
      : [],
    isError: overrides.isError ?? false,
  };
}

// ── Tracer bullet: single tool call + result ──────────────────────────────

describe("buildTurnParts", () => {
  it("merges tool result into matching pending ToolPart", () => {
    const parts: Part[] = [
      textPart("I will search:"),
      pendingTool("call_1", "ov_search"),
    ];

    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_1", content: "found 42 results" }),
    ]);

    expect(result).toHaveLength(2);
    expect((result[1] as ToolPart).toolStatus).toBe("completed");
    expect((result[1] as ToolPart).toolOutput).toBe("found 42 results");
  });

  it("sets toolStatus to error when isError is true", () => {
    const parts: Part[] = [pendingTool("call_err", "bash")];
    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_err", content: "Command failed", isError: true }),
    ]);

    expect((result[0] as ToolPart).toolStatus).toBe("error");
    expect((result[0] as ToolPart).toolOutput).toBe("Command failed");
  });

  it("merges multiple tool results into their matching pending parts", () => {
    const parts: Part[] = [
      textPart("Let me check:"),
      pendingTool("call_1", "ov_search"),
      pendingTool("call_2", "ov_read"),
      textPart("Results below."),
    ];

    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_1", content: "memory found" }),
      resultInput({ toolCallId: "call_2", content: "file contents" }),
    ]);

    expect(result).toHaveLength(4);
    expect((result[1] as ToolPart).toolOutput).toBe("memory found");
    expect((result[1] as ToolPart).toolStatus).toBe("completed");
    expect((result[2] as ToolPart).toolOutput).toBe("file contents");
    expect((result[2] as ToolPart).toolStatus).toBe("completed");
    expect((result[0] as TextPart).text).toBe("Let me check:");
    expect((result[3] as TextPart).text).toBe("Results below.");
  });

  it("passes through parts unchanged when no tool results", () => {
    const parts: Part[] = [textPart("Hello")];
    const result = buildTurnParts(parts, []);

    expect(result).toEqual([textPart("Hello")]);
  });

  it("passes through unchanged when no tool calls in parts", () => {
    const parts: Part[] = [textPart("Just text")];
    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_1", content: "some output" }),
    ]);

    // No matching part for toolCallId call_1 — should ignore
    expect(result).toEqual([textPart("Just text")]);
  });

  it("truncates tool output exceeding max chars and sets toolOutputTruncated", () => {
    const long = "x".repeat(toolOutputMaxChars + 100);
    const parts: Part[] = [pendingTool("call_trunc", "bash")];

    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_trunc", content: long }),
    ]);

    const tp = result[0] as ToolPart;
    expect(tp.toolOutput.length).toBeLessThan(long.length);
    expect(tp.toolOutput).toContain("[truncated");
    expect(tp.toolOutput).toContain("100 more chars");
    expect(tp.toolOutputTruncated).toBe(true);
  });

  it("does not truncate output within limit and leaves toolOutputTruncated false", () => {
    const short = "short output";
    const parts: Part[] = [pendingTool("call_short", "bash")];

    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_short", content: short }),
    ]);

    const tp = result[0] as ToolPart;
    expect(tp.toolOutput).toBe("short output");
    expect(tp.toolOutputTruncated).toBe(false);
  });

  it("ignores tool result with no matching toolCallId", () => {
    const parts: Part[] = [pendingTool("call_a", "tool_a")];
    const result = buildTurnParts(parts, [
      resultInput({ toolCallId: "call_b", content: "orphan output" }),
    ]);

    expect(result).toHaveLength(1);
    expect((result[0] as ToolPart).toolStatus).toBe("pending");
    expect((result[0] as ToolPart).toolOutput).toBe("");
  });

  it("does not mutate original parts array", () => {
    const parts: Part[] = [
      pendingTool("call_1", "ov_search"),
    ];
    const originalToolOutput = (parts[0] as ToolPart).toolOutput;

    buildTurnParts(parts, [
      resultInput({ toolCallId: "call_1", content: "output" }),
    ]);

    expect((parts[0] as ToolPart).toolOutput).toBe(originalToolOutput);
  });

  it("concatenates multiple text items from tool result content", () => {
    const parts: Part[] = [pendingTool("call_concat", "bash")];

    const result = buildTurnParts(parts, [{
      toolCallId: "call_concat",
      toolName: "bash",
      content: [
        { type: "text", text: "line 1" },
        { type: "text", text: "line 2" },
      ],
      isError: false,
    }]);

    expect((result[0] as ToolPart).toolOutput).toBe("line 1\nline 2");
  });
});
