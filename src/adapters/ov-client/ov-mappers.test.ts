import { describe, it, expect } from "vitest";
import { toContent, toDomainError, toResourceImportResult, toAddSkillResult } from "./ov-mappers";
import { Uri } from "../../domain/common/uri";
import { ConnectionError, NotFoundError, ValidationError } from "../../domain/errors/domain-error";
import type { OVResourceImportResponse } from "./ov-resource";
import type { OVAddSkillResponse } from "./ov-skills";

// ── toContent ────────────────────────────────────────────────────────────────

describe("toContent", () => {
  const uri = new Uri("viking://docs/architecture.md");

  it("maps read-level response with body", () => {
    const raw = { uri: "viking://docs/architecture.md", body: "# Architecture\n\nHexagonal design." };
    const result = toContent(raw, uri, "read");
    expect(result.uri).toEqual(uri);
    expect(result.body).toBe("# Architecture\n\nHexagonal design.");
    expect(result.level).toBe("read");
  });

  it("maps abstract-level response", () => {
    const raw = { uri: "viking://docs/architecture.md", body: "Hexagonal architecture overview" };
    const result = toContent(raw, uri, "abstract");
    expect(result.body).toBe("Hexagonal architecture overview");
    expect(result.level).toBe("abstract");
  });

  it("maps overview-level response", () => {
    const raw = { uri: "viking://docs/architecture.md", body: "File: architecture.md — Hexagonal design document" };
    const result = toContent(raw, uri, "overview");
    expect(result.body).toBe("File: architecture.md — Hexagonal design document");
    expect(result.level).toBe("overview");
  });

  it("defaults level to undefined when not provided", () => {
    const raw = { uri: "viking://docs/architecture.md", body: "content" };
    const result = toContent(raw, uri);
    expect(result.level).toBeUndefined();
  });

  it("uses the provided Uri object, not raw.uri string", () => {
    const raw = { uri: "viking://some/other.md", body: "data" };
    const result = toContent(raw, new Uri("viking://authoritative/path.md"), "read");
    expect(result.uri.value).toBe("viking://authoritative/path.md");
  });

  it("handles empty body", () => {
    const raw = { uri: "viking://empty.md", body: "" };
    const result = toContent(raw, uri, "read");
    expect(result.body).toBe("");
  });

  it("handles empty string from OV", () => {
    const raw = "";
    const result = toContent(raw, uri, "read");
    expect(result.body).toBe("");
  });

  it("handles raw with extra fields (OV may return metadata)", () => {
    const raw = {
      uri: "viking:/docs/extra.md",
      body: "content with metadata",
      modTime: "2026-01-01T00:00:00Z",
      size: 1234,
    };
    const result = toContent(raw, uri, "read");
    expect(result.body).toBe("content with metadata");
    expect(result.level).toBe("read");
  });

  it("handles string result from OV transport (read level)", () => {
    const raw = "# Architecture\n\nHexagonal design.";
    const result = toContent(raw, uri, "read");
    expect(result.body).toBe("# Architecture\n\nHexagonal design.");
    expect(result.uri).toEqual(uri);
    expect(result.level).toBe("read");
  });

  it("handles string result from OV transport (abstract level)", () => {
    const raw = "Hexagonal architecture overview";
    const result = toContent(raw, uri, "abstract");
    expect(result.body).toBe("Hexagonal architecture overview");
    expect(result.level).toBe("abstract");
  });

  it("handles string result from OV transport (overview level)", () => {
    const raw = "File: architecture.md — Hexagonal design document";
    const result = toContent(raw, uri, "overview");
    expect(result.body).toBe("File: architecture.md — Hexagonal design document");
    expect(result.level).toBe("overview");
  });

  it("handles empty string result", () => {
    const result = toContent("", uri, "read");
    expect(result.body).toBe("");
  });
});

// ── toDomainError ────────────────────────────────────────────────────────────

describe("toDomainError", () => {
  const label = "KnowledgeBase.find";

  it("maps 401 to ConnectionError", () => {
    const err = toDomainError(401, { message: "unauthorized" }, label);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toContain("Authentication failed");
    expect(err.message).toContain(label);
  });

  it("maps 403 to ConnectionError", () => {
    const err = toDomainError(403, { message: "forbidden" }, label);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toContain("Access denied");
  });

  it("maps 404 to NotFoundError", () => {
    const err = toDomainError(404, { message: "not found" }, label);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toContain("Resource not found");
    expect(err.message).toContain(label);
  });

  it("maps 409 to ValidationError", () => {
    const err = toDomainError(409, { message: "conflict" }, label);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain("Conflict");
  });

  it("maps 422 to ValidationError", () => {
    const err = toDomainError(422, { details: "invalid" }, label);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain("Validation failed");
    expect((err as ValidationError).details).toEqual({ details: "invalid" });
  });

  it("maps unknown 4xx to ValidationError", () => {
    const err = toDomainError(418, { message: "teapot" }, label);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain("418");
  });

  it("maps 5xx to ConnectionError", () => {
    const err = toDomainError(500, { message: "internal error" }, label);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toContain("OV server error");
  });

  it("maps 502 to ConnectionError", () => {
    const err = toDomainError(502, null, label);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toContain("OV server error");
  });

  it("maps 503 to ConnectionError", () => {
    const err = toDomainError(503, { message: "overloaded" }, label);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toContain("Service unavailable");
  });

  it("includes method label in error message", () => {
    const err = toDomainError(404, null, "FsStore.read");
    expect(err.message).toContain("FsStore.read");
  });

  it("handles null/undefined body gracefully", () => {
    const err1 = toDomainError(500, null, label);
    expect(err1).toBeInstanceOf(ConnectionError);

    const err2 = toDomainError(422, undefined, label);
    expect(err2).toBeInstanceOf(ValidationError);
  });
});

// ── toResourceImportResult ───────────────────────────────────────────────────

describe("toResourceImportResult", () => {
  it("extracts status, rootUri, sourcePath from full response", () => {
    const raw: OVResourceImportResponse = {
      status: "success",
      root_uri: "viking://resources/guide.md",
      source_path: "https://example.com/guide.md",
    };
    const result = toResourceImportResult(raw);
    expect(result.status).toBe("success");
    expect(result.rootUri).toBe("viking://resources/guide.md");
    expect(result.sourcePath).toBe("https://example.com/guide.md");
    expect(result.errors).toBeUndefined();
  });

  it("extracts errors array when present", () => {
    const raw: OVResourceImportResponse = {
      status: "error",
      root_uri: "",
      source_path: "https://example.com/bad.pdf",
      errors: ["File too large", "Unsupported format"],
    };
    const result = toResourceImportResult(raw);
    expect(result.status).toBe("error");
    expect(result.errors).toEqual(["File too large", "Unsupported format"]);
  });

  it("handles missing errors", () => {
    const raw: OVResourceImportResponse = {
      status: "success",
      root_uri: "viking://resources/guide.md",
      source_path: "https://example.com/guide.md",
    };
    const result = toResourceImportResult(raw);
    expect(result.errors).toBeUndefined();
  });

  it("filters non-string errors", () => {
    const raw: OVResourceImportResponse = {
      status: "error",
      root_uri: "",
      source_path: "",
      errors: ["real error", 42 as unknown as string, "another error"],
    };
    const result = toResourceImportResult(raw);
    expect(result.errors).toEqual(["real error", "another error"]);
  });
});

// ── toAddSkillResult ─────────────────────────────────────────────────────────

describe("toAddSkillResult", () => {
  it("maps full response with all fields", () => {
    const raw: OVAddSkillResponse = {
      status: "success",
      root_uri: "viking://skills/test-skill",
      uri: "viking://skills/test-skill/SKILL.md",
      name: "test-skill",
      auxiliary_files: 3,
    };
    const result = toAddSkillResult(raw);
    expect(result.rootUri).toBe("viking://skills/test-skill");
    expect(result.uri).toBe("viking://skills/test-skill/SKILL.md");
    expect(result.name).toBe("test-skill");
    expect(result.auxiliaryFiles).toBe(3);
  });

  it("handles zero auxiliary_files", () => {
    const raw: OVAddSkillResponse = {
      status: "success",
      root_uri: "viking://skills/minimal",
      uri: "viking://skills/minimal/SKILL.md",
      name: "minimal",
      auxiliary_files: 0,
    };
    const result = toAddSkillResult(raw);
    expect(result.auxiliaryFiles).toBe(0);
  });

  it("handles empty strings", () => {
    const raw: OVAddSkillResponse = {
      status: "error",
      root_uri: "",
      uri: "",
      name: "",
      auxiliary_files: 0,
    };
    const result = toAddSkillResult(raw);
    expect(result.rootUri).toBe("");
    expect(result.uri).toBe("");
    expect(result.name).toBe("");
  });
});
