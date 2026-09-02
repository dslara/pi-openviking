import { describe, it, expect } from "vitest";
import type { OVSkillRequest, OVSkillResponse } from "./ov-skill";

describe("OVSkillRequest", () => {
  it("creates minimal skill request", () => {
    const r: OVSkillRequest = {};
    expect(r.data).toBeUndefined();
    expect(r.temp_file_id).toBeUndefined();
    expect(r.wait).toBeUndefined();
    expect(r.timeout).toBeUndefined();
    expect(r.telemetry).toBeUndefined();
  });

  it("accepts data as string", () => {
    const r: OVSkillRequest = {
      data: "skill content",
      temp_file_id: "tmp-1",
      wait: true,
      timeout: 60_000,
      telemetry: false,
    };
    expect(r.data).toBe("skill content");
    expect(r.temp_file_id).toBe("tmp-1");
    expect(r.wait).toBe(true);
    expect(r.timeout).toBe(60_000);
    expect(r.telemetry).toBe(false);
  });

  it("accepts data as structured object", () => {
    const r: OVSkillRequest = {
      data: { name: "my-skill", description: "A skill", content: "# Skill" },
    };
    expect(r.data).toEqual({ name: "my-skill", description: "A skill", content: "# Skill" });
  });
});

describe("OVSkillResponse", () => {
  it("creates skill response", () => {
    const r: OVSkillResponse = {
      status: "success",
      root_uri: "viking://user/skills/",
      uri: "viking://user/skills/my-skill",
      name: "my-skill",
    };
    expect(r.status).toBe("success");
    expect(r.root_uri).toBe("viking://user/skills/");
    expect(r.name).toBe("my-skill");
  });

  it("includes optional auxiliary_files and queue_status", () => {
    const r: OVSkillResponse = {
      status: "success",
      root_uri: "viking://user/skills/",
      uri: "viking://user/skills/slow-skill",
      name: "slow-skill",
      auxiliary_files: 2,
      queue_status: { pending: 0, processing: 1, completed: 0 },
    };
    expect(r.auxiliary_files).toBe(2);
    expect(r.queue_status?.pending).toBe(0);
    expect(r.queue_status?.processing).toBe(1);
    expect(r.queue_status?.completed).toBe(0);
  });
});
