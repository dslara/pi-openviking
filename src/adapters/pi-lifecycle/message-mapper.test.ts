import { describe, it, expect } from "vitest";
import { agentMessageToParts } from "./message-mapper";
import type { Part, ToolPart, TextPart } from "../../domain/common/part";

describe("agentMessageToParts", () => {
  it("extracts text from user message with string content", () => {
    const parts = agentMessageToParts({
      role: "user",
      content: "hello world",
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "text", text: "hello world" });
  });

  it("extracts text from assistant message with TextContent array", () => {
    const parts = agentMessageToParts({
      role: "assistant",
      content: [
        { type: "text", text: "Here is some " },
        { type: "text", text: "formatted text" },
      ],
    });
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text", text: "Here is some " });
    expect(parts[1]).toEqual({ type: "text", text: "formatted text" });
  });

  it("returns empty array for tool messages", () => {
    const parts = agentMessageToParts({
      role: "tool",
      content: "some tool output",
    });
    expect(parts).toHaveLength(0);
  });

  it("returns empty array for custom messages", () => {
    const parts = agentMessageToParts({
      role: "custom",
      content: "custom payload",
    });
    expect(parts).toHaveLength(0);
  });

  it("returns empty array for empty string content", () => {
    const parts = agentMessageToParts({
      role: "user",
      content: "",
    });
    expect(parts).toHaveLength(0);
  });

  it("returns empty array for whitespace-only content", () => {
    const parts = agentMessageToParts({
      role: "user",
      content: "   ",
    });
    expect(parts).toHaveLength(0);
  });

  it("returns empty array for undefined content", () => {
    const parts = agentMessageToParts({ role: "user" });
    expect(parts).toHaveLength(0);
  });

  it("ignores ImageContent items in user messages", () => {
    const parts = agentMessageToParts({
      role: "user",
      content: [
        { type: "text", text: "See this image:" },
        { type: "image", data: "base64...", mimeType: "image/png" } as any,
        { type: "text", text: "end of message" },
      ],
    });
    expect(parts).toHaveLength(2);
    expect((parts[0] as TextPart).text).toBe("See this image:");
    expect((parts[1] as TextPart).text).toBe("end of message");
  });

  it("returns empty array for null content", () => {
    const parts = agentMessageToParts({
      role: "assistant",
      content: null as any,
    });
    expect(parts).toHaveLength(0);
  });

  // ── ToolPart from ToolCall ────────────────────────────────────────────────

  it("converts assistant ToolCall to ToolPart with pending status", () => {
    const parts = agentMessageToParts({
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call_123",
          name: "ov_search",
          arguments: { query: "hello" },
        },
      ],
    });
    expect(parts).toHaveLength(1);
    const tp = parts[0] as ToolPart;
    expect(tp.type).toBe("tool");
    expect(tp.toolId).toBe("call_123");
    expect(tp.toolName).toBe("ov_search");
    expect(tp.toolInput).toEqual({ query: "hello" });
    expect(tp.toolStatus).toBe("pending");
    expect(tp.toolOutput).toBe("");
  });

  it("mixes TextPart and ToolPart in assistant message", () => {
    const parts = agentMessageToParts({
      role: "assistant",
      content: [
        { type: "text", text: "I will search:" },
        {
          type: "toolCall",
          id: "call_456",
          name: "ov_search",
          arguments: { query: "world" },
        },
        { type: "text", text: "Done." },
      ],
    });
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ type: "text", text: "I will search:" });
    expect((parts[1] as ToolPart).type).toBe("tool");
    expect((parts[1] as ToolPart).toolId).toBe("call_456");
    expect((parts[1] as ToolPart).toolStatus).toBe("pending");
    expect(parts[2]).toEqual({ type: "text", text: "Done." });
  });

  it("converts toolResult message to ToolPart with success status", () => {
    const parts = agentMessageToParts({
      role: "toolResult",
      toolCallId: "call_789",
      toolName: "ov_search",
      content: [{ type: "text", text: '[{ "result": "ok" }]' }],
      isError: false,
    });
    expect(parts).toHaveLength(1);
    const tp = parts[0] as ToolPart;
    expect(tp.type).toBe("tool");
    expect(tp.toolId).toBe("call_789");
    expect(tp.toolName).toBe("ov_search");
    expect(tp.toolOutput).toBe('[{ "result": "ok" }]');
    expect(tp.toolStatus).toBe("success");
  });

  it("converts toolResult message error to ToolPart with error status", () => {
    const parts = agentMessageToParts({
      role: "toolResult",
      toolCallId: "call_err",
      toolName: "ov_search",
      content: [{ type: "text", text: "Something broke" }],
      isError: true,
    });
    expect(parts).toHaveLength(1);
    const tp = parts[0] as ToolPart;
    expect(tp.type).toBe("tool");
    expect(tp.toolId).toBe("call_err");
    expect(tp.toolOutput).toBe("Something broke");
    expect(tp.toolStatus).toBe("error");
  });

  it("converts toolResult with no text content to empty toolOutput", () => {
    const parts = agentMessageToParts({
      role: "toolResult",
      toolCallId: "call_empty",
      toolName: "ov_read",
      content: [],
      isError: false,
    });
    expect(parts).toHaveLength(1);
    const tp = parts[0] as ToolPart;
    expect(tp.toolOutput).toBe("");
    expect(tp.toolStatus).toBe("success");
  });

  it("handles toolResult with missing content gracefully", () => {
    const parts = agentMessageToParts({
      role: "toolResult",
      toolCallId: "call_missing",
      toolName: "ov_write",
      content: undefined as any,
      isError: false,
    });
    expect(parts).toHaveLength(1);
    const tp = parts[0] as ToolPart;
    expect(tp.toolId).toBe("call_missing");
    expect(tp.toolOutput).toBe("");
  });

  it("preserves toolOutputTruncated and other ToolPart defaults", () => {
    const parts = agentMessageToParts({
      role: "toolResult",
      toolCallId: "call_full",
      toolName: "ov_search",
      content: [{ type: "text", text: "some output" }],
      isError: false,
    });
    const tp = parts[0] as ToolPart;
    expect(tp.toolOutputTruncated).toBe(false);
    expect(tp.durationMs).toBeNull();
    expect(tp.promptTokens).toBeNull();
    expect(tp.completionTokens).toBeNull();
    expect(tp.toolOutputRef).toBe("");
  });
});
