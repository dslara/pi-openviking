/**
 * OV (OpenViking) wire-format Part types.
 * These mirror the snake_case JSON that OV expects on the wire
 * and are used for typed serialization/deserialization at the transport boundary.
 *
 * See OV 05-sessions.md Part Types section.
 */

export interface OVTextPart {
  type: "text";
  text: string;
}

export interface OVToolPart {
  type: "tool";
  tool_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: string;
  tool_status: "pending" | "running" | "completed" | "error";
  skill_uri?: string;
}

export interface OVContextPart {
  type: "context";
  uri: string;
  context_type: "memory" | "resource" | "skill";
  abstract: string;
}

export type OVPart = OVTextPart | OVToolPart | OVContextPart;

/** Error body from OV envelope's `error` field. */
export interface OVErrorBody {
  code?: string;
  message?: string;
}

/**
 * Content read response.
 * OV returns the markdown content as a bare string (unwrapped by Transport).
 * Fallback object shape for backward compat / test mocks.
 */
export type OVContentReadResponse = string | { body: string; uri?: string; level?: string };
