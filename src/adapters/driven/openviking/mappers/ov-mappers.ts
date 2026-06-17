/**
 * Consolidated mappers for OV wire-format to domain types.
 *
 * These mappers translate OV API response shapes into domain types consumed
 * by driven adapters. Kept separate from fs-, search-, session-, and
 * relation-mappers which have more complex mapping logic.
 *
 * See OV 01-overview.md (error format), 03-filesystem.md (content read),
 * 02-resources.md (resource import), 04-skills.md (skills API).
 */

import type { Content } from "../../../../domain/client/ov-types";
import type { ContentLevel } from "../../../../domain/common/content-level";
import { Uri } from "../../../../domain/common/uri";
import type { OVContentReadResponse } from "../types/ov-common";
import { ConnectionError, NotFoundError, ValidationError, DomainError } from "../../../../domain/errors/domain-error";
import type { OVErrorBody } from "../types/ov-common";
import type { ResourceImportResult } from "../../../../domain/client/ov-types";
import type { OVResourceImportResponse } from "../types/ov-resource";
import type { AddSkillResult } from "../../../../domain/client/ov-types";
import type { OVAddSkillResponse } from "../types/ov-skills";

// ── Content mapper ───────────────────────────────────────────────────────────

function extractBody(raw: OVContentReadResponse): string {
  if (typeof raw === "string") return raw;
  return raw?.body ?? "";
}

export function toContent(raw: OVContentReadResponse, uri: Uri, level?: ContentLevel): Content {
  const body = extractBody(raw);
  return { uri, body, level };
}

// ── Error mapper ─────────────────────────────────────────────────────────────

function extractMessage(body: OVErrorBody | Record<string, unknown> | null | undefined): string {
  if (!body) return "";
  if (typeof body.message === "string") return body.message;
  const r = body as Record<string, unknown>;
  if (typeof r.error === "string") return r.error;
  // OV error envelope: { error: { code: "NOT_FOUND", message: "..." } }
  if (r.error && typeof r.error === "object") {
    const errObj = r.error as Record<string, unknown>;
    if (typeof errObj.message === "string") return errObj.message;
  }
  if (typeof r.detail === "string") return r.detail;
  return "";
}

export function toDomainError(
  httpStatus: number,
  body: OVErrorBody | Record<string, unknown> | null | undefined,
  methodLabel: string,
): DomainError {
  const msg = extractMessage(body);
  const prefix = `[${methodLabel}]`;

  if (httpStatus === 401) {
    return new ConnectionError(`${prefix} Authentication failed — ${msg || "check API key"}`);
  }
  if (httpStatus === 403) {
    return new ConnectionError(`${prefix} Access denied — ${msg || "check account/user permissions"}`);
  }
  if (httpStatus === 404) {
    return new NotFoundError(`${prefix} Resource not found — ${msg || "URI does not exist"}`);
  }
  if (httpStatus === 409) {
    return new ValidationError(`${prefix} Conflict — ${msg || "resource already exists"}`);
  }
  if (httpStatus === 422) {
    return new ValidationError(
      `${prefix} Validation failed — ${msg || "invalid request"}`,
      body && typeof body === "object" ? (body as Record<string, unknown>) : undefined,
    );
  }
  if (httpStatus === 503) {
    return new ConnectionError(`${prefix} Service unavailable — ${msg || "OV is overloaded"}`);
  }
  if (httpStatus >= 500) {
    return new ConnectionError(`${prefix} OV server error (${httpStatus}) — ${msg || "unknown"}`);
  }
  return new ValidationError(`${prefix} Request failed (${httpStatus}) — ${msg || "unknown"}`);
}

// ── Resource mapper ──────────────────────────────────────────────────────────

export function toResourceImportResult(raw: OVResourceImportResponse): ResourceImportResult {
  const errors = Array.isArray(raw.errors)
    ? raw.errors.filter((e): e is string => typeof e === "string")
    : undefined;

  return {
    status: raw.status,
    rootUri: raw.root_uri,
    sourcePath: raw.source_path,
    errors: errors?.length ? errors : undefined,
  };
}

// ── Skill mapper ─────────────────────────────────────────────────────────────

export function toAddSkillResult(raw: OVAddSkillResponse): AddSkillResult {
  return {
    rootUri: raw.root_uri,
    uri: raw.uri,
    name: raw.name,
    auxiliaryFiles: typeof raw.auxiliary_files === "number" || Array.isArray(raw.auxiliary_files) ? raw.auxiliary_files as unknown as string[] : [],
  };
}
