/**
 * OV adapter factory.
 * Creates all driven adapters for OV API endpoints.
 *
 * See OV 01-overview.md (connection/auth), 02-resources.md, 03-filesystem.md,
 *     05-sessions.md, 06-retrieval.md, 08-relations.md.
 */
import type { KnowledgeBase } from "../../../domain/ports/knowledge-base";
import type { FsStore } from "../../../domain/ports/fs-store";
import type { GraphStore } from "../../../domain/ports/graph-store";
import type { SessionStore } from "../../../domain/ports/session-store";
import type { ResourceStore } from "../../../domain/ports/resource-store";
import type { SkillStore } from "../../../domain/ports/skill-store";
import type { OVAdapterConfig } from "../../infrastructure/config";
import type { Logger } from "../../../domain/ports/logger";
import { Transport } from "./transport";
import { FsStoreAdapter } from "./fs-store";
import { KnowledgeBaseAdapter } from "./knowledge-base";
import { SessionStoreAdapter } from "./session-store";
import { GraphStoreAdapter } from "./graph-store";
import { ResourceStoreAdapter } from "./resource-store";
import { SkillStoreAdapter } from "./skill-store";

export interface OVAdapter {
  knowledgeBase: KnowledgeBase;
  fsStore: FsStore;
  graphStore: GraphStore;
  sessionStore: SessionStore;
  resourceStore: ResourceStore;
  skillStore: SkillStore;
  /** True when the circuit breaker is OPEN — fast fail for recall guard */
  readonly circuitBreakerOpen: boolean;
  /** Underlying HTTP transport, shared by all adapters */
  readonly transport: Transport;
}

export function createOVAdapter(config: OVAdapterConfig, logger?: Logger): OVAdapter {
  const transport = new Transport(config, logger);

  return {
    knowledgeBase: new KnowledgeBaseAdapter(transport),
    fsStore: new FsStoreAdapter(transport, logger),
    graphStore: new GraphStoreAdapter(transport),
    sessionStore: new SessionStoreAdapter(transport, config.commitTimeout),
    resourceStore: new ResourceStoreAdapter(transport),
    skillStore: new SkillStoreAdapter(transport),
    get circuitBreakerOpen() { return transport.isCircuitBreakerOpen(); },
    transport,
  };
}
