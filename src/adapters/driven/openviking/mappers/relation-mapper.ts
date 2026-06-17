/**
 * Mappers for OV relation/graph endpoints.
 *
 * See OV 08-relations.md.
 */
import { Uri } from "../../../../domain/common/uri";
import type { LinkResult } from "../../../../domain/client/ov-types";
import type { Relation } from "../../../../domain/knowledge/model/relation";
import type { OVRelationItem, OVRelationEnvelope } from "../types/ov-relation";

function toRelationItem(raw: OVRelationItem): Relation {
  return {
    uri: raw.uri,
    reason: raw.reason ?? undefined,
  };
}

export function toLinkResult(
  _raw: unknown,
  source: Uri,
  targets: Uri[],
  reason?: string,
): LinkResult {
  return {
    source,
    targets,
    reason,
  };
}

export function toRelations(raw: OVRelationItem[] | OVRelationEnvelope | null | undefined): Relation[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : (Array.isArray(raw.relations) ? raw.relations : []);
  return items.map(toRelationItem);
}
