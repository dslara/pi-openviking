/**
 * OV wire-format types for relation/graph endpoints.
 *
 * See OV 08-relations.md.
 */

export interface OVRelationItem {
  uri: string;
  reason?: string;
}

/**
 * OV returns relation arrays directly from GET /api/v1/relations.
 * This type is kept for backward compat with { relations: [...] } format.
 */
export interface OVRelationEnvelope {
  relations: OVRelationItem[];
}
