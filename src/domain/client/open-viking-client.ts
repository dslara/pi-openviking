/**
 * OpenVikingClient — unified hexagon-facing interface.
 *
 * Single client interface composed of 6 sub-interfaces covering all
 * OpenViking operations. Maps one-to-one to OVAdapter sub-adapters.
 */
import type {
  FindQuery,
  SearchRequest,
  SearchOptions,
} from "../common/search-query";
import type { SearchResult } from "../knowledge/search-result";
import type {
  Content,
  WriteResult,
  FsEntry,
  ReindexMode,
  GlobResult,
  GrepResult,
  GrepOptions,
  CommitResult,
  CommitOptions,
  SessionInfo,
  TaskStatus,
  LinkResult,
  ResourceImportResult,
  ImportOptions,
  AddSkillResult,
  SkillData,
  AddSkillOptions,
} from "./ov-types";
import type { WriteMode } from "../common/write-mode";
import type { Uri } from "../common/uri";
import type { ContentLevel } from "../common/content-level";
import type { SessionId } from "../common/session-id";
import type { Part } from "../common/part";
import type { Relation } from "../knowledge/relation";

// ── Sub-interfaces ──────────────────────────────────────────────────────

export interface SearchClient {
  find(
    query: FindQuery,
    opts?: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchResult>;
  search(
    req: SearchRequest,
    opts?: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchResult>;
  glob(
    pattern: string,
    uri?: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<GlobResult>;
  grep(
    pattern: string,
    opts?: GrepOptions,
    signal?: AbortSignal,
  ): Promise<GrepResult>;
}

export interface FsClient {
  read(
    uri: Uri,
    level?: ContentLevel,
    offset?: number,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Content>;
  save(
    uri: Uri,
    content: string,
    mode?: WriteMode,
    signal?: AbortSignal,
  ): Promise<WriteResult>;
  mkdir(uri: Uri, signal?: AbortSignal): Promise<void>;
  mv(from: Uri, to: Uri, signal?: AbortSignal): Promise<void>;
  list(
    uri: Uri,
    recursive?: boolean,
    signal?: AbortSignal,
  ): Promise<FsEntry[]>;
  tree(uri: Uri, signal?: AbortSignal): Promise<FsEntry[]>;
  stat(uri: Uri, signal?: AbortSignal): Promise<FsEntry>;
  delete(
    uri: Uri,
    recursive?: boolean,
    signal?: AbortSignal,
  ): Promise<void>;
  reindex(
    uri: Uri,
    mode?: ReindexMode,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface SessionClient {
  createSession(signal?: AbortSignal): Promise<SessionId>;
  sendMessage(
    id: SessionId,
    role: string,
    parts: Part[],
    signal?: AbortSignal,
  ): Promise<void>;
  sendMessages(
    id: SessionId,
    msgs: { role: string; content: Part[] }[],
    signal?: AbortSignal,
  ): Promise<void>;
  commit(
    id: SessionId,
    opts?: CommitOptions,
    signal?: AbortSignal,
  ): Promise<CommitResult>;
  getSession(
    id: SessionId,
    signal?: AbortSignal,
  ): Promise<SessionInfo>;
  getTaskStatus(
    taskId: string,
    signal?: AbortSignal,
  ): Promise<TaskStatus>;
  sessionUsed(
    id: SessionId,
    contexts: Uri[],
    signal?: AbortSignal,
  ): Promise<void>;
  deleteSession(
    id: SessionId,
    signal?: AbortSignal,
  ): Promise<void>;
  listSessions(signal?: AbortSignal): Promise<SessionInfo[]>;
}

export interface RelationClient {
  link(
    source: Uri,
    targets: Uri | Uri[],
    reason?: string,
    signal?: AbortSignal,
  ): Promise<LinkResult>;
  unlink(
    source: Uri,
    target: Uri,
    signal?: AbortSignal,
  ): Promise<void>;
  graph(uri: Uri, signal?: AbortSignal): Promise<Relation[]>;
}

export interface ResourceClient {
  importUrl(
    url: string,
    options?: ImportOptions,
    signal?: AbortSignal,
  ): Promise<ResourceImportResult>;
}

export interface SkillClient {
  addSkill(
    data: string | SkillData,
    options?: AddSkillOptions,
    signal?: AbortSignal,
  ): Promise<AddSkillResult>;
}

// ── Composite ───────────────────────────────────────────────────────────

export interface OpenVikingClient
  extends SearchClient,
    FsClient,
    SessionClient,
    RelationClient,
    ResourceClient,
    SkillClient {}
