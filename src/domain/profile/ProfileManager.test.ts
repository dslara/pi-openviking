import { describe, it, expect } from "vitest";
import { ProfileManager } from "./ProfileManager";
import type { ProfileConfig } from "../common/profile-config";

function makeProfiles(): Record<string, ProfileConfig> {
  return {
    default: {
      name: "default",
      description: "Default",
      behavior: { topN: 3, scoreThreshold: 0.5, searchMode: "search", autoRecall: true },
    },
    "web-dev": {
      name: "web-dev",
      description: "Web dev",
      behavior: { topN: 3, scoreThreshold: 0.5, searchMode: "search", autoRecall: true },
    },
    docs: {
      name: "docs",
      description: "Docs",
      behavior: { topN: 5, scoreThreshold: 0.3, searchMode: "search", autoRecall: true },
    },
    learning: {
      name: "learning",
      description: "Learning",
      behavior: { topN: 8, scoreThreshold: 0.2, searchMode: "search", autoRecall: true },
    },
  };
}

describe("ProfileManager", () => {
  it("creates with valid activeProfile and returns it via getActive()", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    expect(pm.getActive()).toBe("default");
  });

  it("throws when activeProfile not found in profiles registry", () => {
    expect(() => new ProfileManager(makeProfiles(), "ghost")).toThrow(/ghost/);
  });

  it("resolve returns shallow copy of behavior for a valid profile", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    const behavior = pm.resolve("docs");
    expect(behavior.topN).toBe(5);
    expect(behavior.scoreThreshold).toBe(0.3);
    expect(behavior.searchMode).toBe("search");
    expect(behavior.targetUri).toBeUndefined();
    expect(behavior.expandGraph).toBeUndefined();
  });

  it("resolve returns only populated fields (undefined for unset)", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    const behavior = pm.resolve("default");
    expect(behavior.topN).toBeDefined();
    expect(behavior.targetUri).toBeUndefined();
    expect(behavior.expandGraph).toBeUndefined();
  });

  it("resolve throws for unknown profile name", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    expect(() => pm.resolve("nonexistent")).toThrow(/nonexistent/);
  });

  it("apply changes active profile", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    pm.apply("learning");
    expect(pm.getActive()).toBe("learning");
  });

  it("apply throws for unknown profile name", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    expect(() => pm.apply("nonexistent")).toThrow(/nonexistent/);
  });

  it("list returns all profile names", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    const names = pm.list();
    expect(names).toHaveLength(4);
    expect(names).toContain("default");
    expect(names).toContain("web-dev");
    expect(names).toContain("docs");
    expect(names).toContain("learning");
  });

  it("resolve returns new object each call (not mutating source)", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    const a = pm.resolve("default");
    const b = pm.resolve("default");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("apply then resolve returns new profile's behavior", () => {
    const pm = new ProfileManager(makeProfiles(), "default");
    pm.apply("docs");
    expect(pm.getActive()).toBe("docs");
    const behavior = pm.resolve("docs");
    expect(behavior.topN).toBe(5);
    expect(behavior.scoreThreshold).toBe(0.3);
  });

  it("constructor throws with informative error for unknown activeProfile", () => {
    const profiles = makeProfiles();
    expect(() => new ProfileManager(profiles, "missing-profile")).toThrow(
      /missing-profile/,
    );
  });
});
