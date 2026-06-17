/**
 * Adapter for OV relation/graph endpoints.
 *
 * See OV 08-relations.md.
 */
import type { Transport } from "./transport";
import { toLinkResult, toRelations } from "./mappers/relation-mapper";
import type { LinkResult } from "../../../domain/client/ov-types";
import type { Relation } from "../../../domain/knowledge/model/relation";
import type { Uri } from "../../../domain/common/uri";
import type { OVRelationItem } from "./types/ov-relation";

export class GraphStoreAdapter {
  constructor(private readonly transport: Transport) {}

  async link(source: Uri, targets: Uri | Uri[], reason?: string, signal?: AbortSignal): Promise<LinkResult> {
    const targetArray = Array.isArray(targets) ? targets : [targets];
    const body = JSON.stringify({
      from_uri: source.value,
      to_uris: targetArray.map((u) => u.value),
      ...(reason !== undefined ? { reason } : {}),
    });

    const raw = await this.transport.request<Record<string, unknown>>(
      "GraphStore.link",
      "/api/v1/relations/link",
      { method: "POST", body },
      signal,
    );

    return toLinkResult(raw, source, targetArray, reason);
  }

  async unlink(source: Uri, target: Uri, signal?: AbortSignal): Promise<void> {
    const body = JSON.stringify({
      from_uri: source.value,
      to_uri: target.value,
    });
    await this.transport.request<unknown>(
      "GraphStore.unlink",
      "/api/v1/relations/link",
      { method: "DELETE", body },
      signal,
    );
  }

  async graph(uri: Uri, signal?: AbortSignal): Promise<Relation[]> {
    const raw = await this.transport.request<OVRelationItem[]>(
      "GraphStore.graph",
      `/api/v1/relations?uri=${encodeURIComponent(uri.value)}`,
      undefined,
      signal,
    );
    return toRelations(raw);
  }
}
