import { describe, it, expect } from "vitest";
import { autoDetectProfile } from "./auto-detect";

describe("autoDetectProfile", () => {
  it("returns profile name when cwd matches a rule pattern", () => {
    const rules = {
      "**/web-app/**": "web-dev",
    };

    const result = autoDetectProfile("/home/user/projects/web-app/src", rules);
    expect(result).toBe("web-dev");
  });

  it("returns null when no rules match", () => {
    const rules = {
      "**/docs/**": "docs",
    };

    const result = autoDetectProfile("/home/user/projects/web-app/src", rules);
    expect(result).toBeNull();
  });

  it("returns null for empty rules", () => {
    const result = autoDetectProfile("/any/path", {});
    expect(result).toBeNull();
  });

  it("picks first matching rule when multiple match", () => {
    const rules = {
      "**/web-app/**": "web-dev",
      "**/frontend/**": "frontend",
    };

    // Path matches both patterns, should return first rule's profile
    const result = autoDetectProfile("/home/user/projects/web-app/frontend/src", rules);
    expect(result).toBe("web-dev");
  });

  it("matches single-segment wildcard correctly", () => {
    const rules = {
      "**/docs/*": "docs",
    };

    // Should match docs/file (single segment after /docs/)
    const match1 = autoDetectProfile("/home/user/projects/docs/file.md", rules);
    expect(match1).toBe("docs");
  });

  it("does not match single-segment wildcard across subdirectories", () => {
    const rules = {
      "**/docs/*": "docs",
    };

    // Should NOT match docs/subdir/file (two segments after /docs/)
    const match2 = autoDetectProfile("/home/user/projects/docs/subdir/file.md", rules);
    expect(match2).toBeNull();
  });

  it("handles Windows-style paths with backslashes", () => {
    const rules = {
      "**/web-app/**": "web-dev",
    };

    const result = autoDetectProfile("C:\\Users\\me\\projects\\web-app\\src", rules);
    expect(result).toBe("web-dev");
  });

  it("does not match when cwd ends differently than pattern", () => {
    const rules = {
      "**/web-app/**": "web-dev",
    };

    const result = autoDetectProfile("/home/user/projects/other-app/src", rules);
    expect(result).toBeNull();
  });
});
