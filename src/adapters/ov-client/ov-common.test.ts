import { describe, it, expect } from "vitest";
import type { OVTextPart, OVToolPart, OVContextPart, OVPart } from "./ov-common";

describe("OVTextPart", () => {
  it("creates valid OVTextPart", () => {
    const p: OVTextPart = { type: "text", text: "hello world" };
    expect(p.type).toBe("text");
    expect(p.text).toBe("hello world");
  });
});

describe("OVToolPart", () => {
  it("creates valid OVToolPart with required fields", () => {
    const p: OVToolPart = {
      type: "tool",
      tool_id: "call_1",
      tool_name: "ov_search",
      tool_input: { query: "test" },
      tool_output: "result",
      tool_status: "completed",
    };
    expect(p.type).toBe("tool");
    expect(p.tool_id).toBe("call_1");
    expect(p.tool_name).toBe("ov_search");
    expect(p.tool_input).toEqual({ query: "test" });
    expect(p.tool_output).toBe("result");
    expect(p.tool_status).toBe("completed");
  });

  it("accepts all tool statuses", () => {
    const pending: OVToolPart = { type: "tool", tool_id: "t1", tool_name: "n", tool_input: {}, tool_output: "", tool_status: "pending" };
    const running: OVToolPart = { type: "tool", tool_id: "t2", tool_name: "n", tool_input: {}, tool_output: "", tool_status: "running" };
    const completed: OVToolPart = { type: "tool", tool_id: "t3", tool_name: "n", tool_input: {}, tool_output: "", tool_status: "completed" };
    const error: OVToolPart = { type: "tool", tool_id: "t4", tool_name: "n", tool_input: {}, tool_output: "", tool_status: "error" };
    expect(pending.tool_status).toBe("pending");
    expect(running.tool_status).toBe("running");
    expect(completed.tool_status).toBe("completed");
    expect(error.tool_status).toBe("error");
  });

  it("accepts optional skill_uri", () => {
    const p: OVToolPart = {
      type: "tool",
      tool_id: "call_2",
      tool_name: "read",
      tool_input: {},
      tool_output: "",
      tool_status: "error",
      skill_uri: "viking://user/skills/read",
    };
    expect(p.skill_uri).toBe("viking://user/skills/read");
  });

  it("omits optional skill_uri when not provided", () => {
    const p: OVToolPart = {
      type: "tool",
      tool_id: "call_3",
      tool_name: "search",
      tool_input: {},
      tool_output: "ok",
      tool_status: "completed",
    };
    expect(p.skill_uri).toBeUndefined();
  });
});

describe("OVContextPart", () => {
  it("creates valid OVContextPart", () => {
    const p: OVContextPart = {
      type: "context",
      uri: "viking://resources/doc.md",
      context_type: "resource",
      abstract: "Documentation file",
    };
    expect(p.type).toBe("context");
    expect(p.uri).toBe("viking://resources/doc.md");
    expect(p.context_type).toBe("resource");
    expect(p.abstract).toBe("Documentation file");
  });

  it("accepts memory and skill context types", () => {
    const mem: OVContextPart = { type: "context", uri: "viking://mem/1", context_type: "memory", abstract: "a memory" };
    const skill: OVContextPart = { type: "context", uri: "viking://skills/x", context_type: "skill", abstract: "a skill" };
    expect(mem.context_type).toBe("memory");
    expect(skill.context_type).toBe("skill");
  });
});

describe("OVPart", () => {
  it("discriminates on type field", () => {
    const parts: OVPart[] = [
      { type: "text", text: "hi" },
      { type: "tool", tool_id: "t1", tool_name: "n", tool_input: {}, tool_output: "", tool_status: "completed" },
      { type: "context", uri: "viking://r", context_type: "resource", abstract: "a" },
    ];

    const texts = parts.filter((p): p is OVTextPart => p.type === "text");
    const tools = parts.filter((p): p is OVToolPart => p.type === "tool");
    const contexts = parts.filter((p): p is OVContextPart => p.type === "context");

    expect(texts).toHaveLength(1);
    expect(tools).toHaveLength(1);
    expect(contexts).toHaveLength(1);
  });

  it("narrows correctly in type guards", () => {
    const parts: OVPart[] = [
      { type: "text", text: "hello" },
      { type: "context", uri: "u", context_type: "memory", abstract: "a" },
    ];

    for (const p of parts) {
      if (p.type === "context") {
        expect(p.context_type).toBeDefined();
        expect(p.uri).toBeDefined();
      } else if (p.type === "text") {
        expect(p.text).toBeDefined();
      }
    }
  });
});
