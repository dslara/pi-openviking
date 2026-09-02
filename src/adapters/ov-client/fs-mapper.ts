/**
 * Mappers for OV filesystem endpoints (write, ls, tree, stat).
 *
 * See OV 03-filesystem.md.
 */
import { Uri } from "../../domain/common/uri";
import type { FsEntry, WriteResult } from "../../domain/client/ov-types";
import type { OVFsEntry, OVWriteResponse } from "./ov-fs";

export function toWriteResult(raw: OVWriteResponse, expectedUri: string): WriteResult {
  return {
    uri: new Uri(expectedUri),
    success: true,
    writtenBytes: raw.written_bytes,
    contentUpdated: raw.content_updated,
    semanticStatus: raw.semantic_status,
    vectorStatus: raw.vector_status,
  };
}

const VALID_TYPES = new Set(["file", "directory"]);

function assertValidType(t: string): asserts t is "file" | "directory" {
  if (!VALID_TYPES.has(t)) {
    throw new Error(`Invalid FsEntry type: "${t}" — must be "file" or "directory"`);
  }
}

export function toFsEntry(raw: OVFsEntry, fallbackUri?: string): FsEntry {
  // OV returns `uri` (ls/tree) or `name` (stat) for the identifier
  const uriStr = raw.uri || raw.name
    ? (raw.uri || raw.name)
    : undefined;

  if (!uriStr) {
    throw new Error("FsEntry missing required field: uri");
  }

  // OV returns `isDir` (boolean); fallback to `type` string for backward compat
  const type = raw.isDir
    ? "directory" as const
    : "file" as const;

  return {
    uri: new Uri(uriStr),
    type,
    size: raw.size ?? undefined,
    modTime: raw.modTime || undefined,
  };
}

export function toFsEntries(raw: OVFsEntry[]): FsEntry[] {
  return raw.map((item) => toFsEntry(item));
}
