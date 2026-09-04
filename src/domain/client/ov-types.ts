/**
 * Shared OV types — return types and option types for OpenVikingClient.
 *
 * Extracted from old port files during Flat Hexagon cleanup to eliminate
 * interface duplication. These are pure type definitions with zero logic.
 */
import type { Uri } from "../common/uri";
import type { SessionId } from "../common/session-id";

// ── Common ──────────────────────────────────────────────────────────────

export interface Content {
  uri: Uri;
  body: string;
  level?: string;
}

export interface WriteResult {
  success: boolean;
  uri?: Uri;
  writtenBytes?: number;
  contentUpdated?: boolean;
  semanticStatus?: string;
  vectorStatus?: string;
}

export interface FsEntry {
  uri: Uri;
  type: "file" | "directory";
  size?: number;
  modTime?: string;
}

export type ReindexMode = "vectors_only" | "full";

// ── Search ──────────────────────────────────────────────────────────────

export interface GlobResult {
  entries: string[];
  total: number;
}

export interface GrepMatch {
  uri: string;
  line: number;
  content: string;
  lineNumber?: number;
}

export interface GrepResult {
  total: number;
  matches: GrepMatch[];
}

export interface GrepOptions {
  pattern?: string;
  uri?: string;
  caseInsensitive?: boolean;
  excludeUri?: string;
  levelLimit?: number;
  nodeLimit?: number;
}

// ── Session ─────────────────────────────────────────────────────────────

export interface CommitResult {
  sessionId: SessionId;
  taskId?: string;
  archiveUri?: string;
  archived?: boolean;
}

export interface CommitOptions {
  keepRecentCount?: number;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalMessageCount?: number;
  commitCount: number;
  memoriesExtracted?: number;
  lastCommitAt?: string;
}

export interface TaskStatus {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
}

export interface TaskFilter {
  taskType?: string;
  status?: string;
  resourceId?: string;
  limit?: number;
}

// ── Graph ───────────────────────────────────────────────────────────────

export interface LinkResult {
  source: Uri;
  targets: Uri[];
  reason?: string;
}

// ── Resource / Skill ─────────────────────────────────────────────

export interface ResourceImportResult {
  status: string;
  rootUri: string;
  sourcePath: string;
  errors?: string[];
  uri?: string;
}

export interface ImportOptions {
  targetUri?: string;
  reason?: string;
  wait?: boolean;
}

export interface AddSkillResult {
  rootUri: string;
  uri: string;
  name: string;
  auxiliaryFiles?: string[];
}

export interface SkillData {
  name: string;
  description?: string;
  content?: string;
  allowedTools?: string[];
  tags?: string[];
}

export interface AddSkillOptions {
  wait?: boolean;
  timeout?: number;
}
