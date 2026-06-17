/**
 * OpenVikingClientAdapter — delegates OpenVikingClient to OVAdapter sub-adapters.
 *
 * Pure delegation: each method calls the corresponding existing adapter method.
 * No transformation, no enrichment. Isolated in case needed later.
 */
import type {
  OpenVikingClient,
  SearchClient,
  FsClient,
  SessionClient,
  RelationClient,
  ResourceClient,
  SkillClient,
} from "../../../../domain/client/open-viking-client";
import type { OVAdapter } from "../adapter";
import type { Part } from "../../../../domain/common/part";
import type { Uri } from "../../../../domain/common/uri";
import type { SkillData } from "../../../../domain/client/ov-types";

export class OpenVikingClientAdapter
  implements OpenVikingClient
{
  readonly searchClient: SearchClient;
  readonly fsClient: FsClient;
  readonly sessionClient: SessionClient;
  readonly relationClient: RelationClient;
  readonly resourceClient: ResourceClient;
  readonly skillClient: SkillClient;

  constructor(private readonly adapter: OVAdapter) {
    this.searchClient = this;
    this.fsClient = this;
    this.sessionClient = this;
    this.relationClient = this;
    this.resourceClient = this;
    this.skillClient = this;
  }

  // ── SearchClient ──────────────────────────────────────────────────────

  find(
    query: Parameters<SearchClient["find"]>[0],
    opts?: Parameters<SearchClient["find"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.knowledgeBase.find(query, opts, signal);
  }

  search(
    req: Parameters<SearchClient["search"]>[0],
    opts?: Parameters<SearchClient["search"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.knowledgeBase.search(req, opts, signal);
  }

  glob(
    pattern: string,
    uri?: string,
    limit?: number,
    signal?: AbortSignal,
  ) {
    return this.adapter.knowledgeBase.glob(pattern, uri, limit, signal);
  }

  grep(
    pattern: string,
    opts?: Parameters<SearchClient["grep"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.knowledgeBase.grep(pattern, opts, signal);
  }

  // ── FsClient ──────────────────────────────────────────────────────────

  read(
    uri: Parameters<FsClient["read"]>[0],
    level?: Parameters<FsClient["read"]>[1],
    offset?: Parameters<FsClient["read"]>[2],
    limit?: Parameters<FsClient["read"]>[3],
    signal?: AbortSignal,
  ) {
    return this.adapter.fsStore.read(uri, level, offset, limit, signal);
  }

  save(
    uri: Parameters<FsClient["save"]>[0],
    content: string,
    mode?: Parameters<FsClient["save"]>[2],
    signal?: AbortSignal,
  ) {
    return this.adapter.fsStore.write(uri, content, mode, signal);
  }

  mkdir(uri: Parameters<FsClient["mkdir"]>[0], signal?: AbortSignal) {
    return this.adapter.fsStore.mkdir(uri, signal);
  }

  mv(
    from: Parameters<FsClient["mv"]>[0],
    to: Parameters<FsClient["mv"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.fsStore.mv(from, to, signal);
  }

  list(
    uri: Parameters<FsClient["list"]>[0],
    recursive?: boolean,
    signal?: AbortSignal,
  ) {
    return this.adapter.fsStore.list(uri, recursive, signal);
  }

  tree(uri: Parameters<FsClient["tree"]>[0], signal?: AbortSignal) {
    return this.adapter.fsStore.tree(uri, signal);
  }

  stat(uri: Parameters<FsClient["stat"]>[0], signal?: AbortSignal) {
    return this.adapter.fsStore.stat(uri, signal);
  }

  delete(
    uri: Parameters<FsClient["delete"]>[0],
    recursive?: boolean,
    signal?: AbortSignal,
  ) {
    return this.adapter.fsStore.delete(uri, recursive, signal);
  }

  reindex(
    uri: Parameters<FsClient["reindex"]>[0],
    mode?: Parameters<FsClient["reindex"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.fsStore.reindex(uri, mode, signal);
  }

  // ── SessionClient ─────────────────────────────────────────────────────

  createSession(signal?: AbortSignal) {
    return this.adapter.sessionStore.create(signal);
  }

  sendMessage(
    id: Parameters<SessionClient["sendMessage"]>[0],
    role: string,
    parts: Parameters<SessionClient["sendMessage"]>[2],
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.sendMessage(id, role, parts, signal);
  }

  sendMessages(
    id: Parameters<SessionClient["sendMessages"]>[0],
    msgs: { role: string; content: Part[] }[],
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.sendMessages(id, msgs, signal);
  }

  commit(
    id: Parameters<SessionClient["commit"]>[0],
    opts?: Parameters<SessionClient["commit"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.commit(id, opts, signal);
  }

  getSession(
    id: Parameters<SessionClient["getSession"]>[0],
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.getSession(id, signal);
  }

  getTaskStatus(
    taskId: string,
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.getTaskStatus(taskId, signal);
  }

  sessionUsed(
    id: Parameters<SessionClient["sessionUsed"]>[0],
    contexts: Uri[],
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.sessionUsed(id, contexts, signal);
  }

  deleteSession(
    id: Parameters<SessionClient["deleteSession"]>[0],
    signal?: AbortSignal,
  ) {
    return this.adapter.sessionStore.deleteSession(id, signal);
  }

  listSessions(signal?: AbortSignal) {
    return this.adapter.sessionStore.listSessions(signal);
  }

  // ── RelationClient ────────────────────────────────────────────────────

  link(
    source: Parameters<RelationClient["link"]>[0],
    targets: Parameters<RelationClient["link"]>[1],
    reason?: string,
    signal?: AbortSignal,
  ) {
    return this.adapter.graphStore.link(source, targets, reason, signal);
  }

  unlink(
    source: Parameters<RelationClient["unlink"]>[0],
    target: Parameters<RelationClient["unlink"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.graphStore.unlink(source, target, signal);
  }

  graph(uri: Parameters<RelationClient["graph"]>[0], signal?: AbortSignal) {
    return this.adapter.graphStore.graph(uri, signal);
  }

  // ── ResourceClient ────────────────────────────────────────────────────

  importUrl(
    url: string,
    options?: Parameters<ResourceClient["importUrl"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.resourceStore.importUrl(url, options, signal);
  }

  // ── SkillClient ───────────────────────────────────────────────────────

  addSkill(
    data: string | SkillData,
    options?: Parameters<SkillClient["addSkill"]>[1],
    signal?: AbortSignal,
  ) {
    return this.adapter.skillStore.addSkill(data, options, signal);
  }
}

