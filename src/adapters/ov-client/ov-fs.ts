/**
 * OV wire-format types for filesystem endpoints.
 *
 * See OV 03-filesystem.md.
 */

export interface OVFsEntry {
  name: string;
  size: number;
  mode: number;
  modTime: string;
  isDir: boolean;
  uri: string;
  meta?: Record<string, unknown>;
  count?: number;
}

export interface OVQueueStatus {
  processed: number;
  error_count: number;
  errors: unknown[];
}

export interface OVWriteResponse {
  uri: string;
  root_uri: string;
  context_type: string;
  mode: string;
  written_bytes: number;
  content_updated: boolean;
  semantic_status: string;
  vector_status: string;
  queue_status?: {
    Semantic?: OVQueueStatus;
    Embedding?: OVQueueStatus;
  };
}

export type OVReadResponse = string;
