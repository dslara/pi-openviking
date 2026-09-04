/**
 * OV wire-format types for session endpoints.
 *
 * See OV 05-sessions.md.
 */

export interface OVCommitResponse {
  session_id: string;
  status: string;
  task_id?: string;
  archive_uri?: string;
  archived?: boolean;
}

export interface OVCreateSessionResponse {
  session_id: string;
  user: {
    account_id: string;
    user_id: string;
  };
}

export interface OVSessionLlmTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

export interface OVSessionInfo {
  session_id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  total_message_count?: number;
  commit_count: number;
  memories_extracted?: Record<string, number>;
  last_commit_at?: string;
  llm_token_usage?: OVSessionLlmTokenUsage;
  user?: { account_id: string; user_id: string };
  pending_tokens?: number;
}

export interface OVAddMessageResponse {
  session_id: string;
  message_count: number;
}

export interface OVBatchAddMessagesResponse {
  session_id: string;
  message_count: number;
  added: number;
}

export interface OVSessionUsedResponse {
  session_id: string;
  contexts_used: number;
  skills_used: number;
}

export interface OVDeleteSessionResponse {
  session_id: string;
}

export interface OVListSessionsEntry {
  session_id: string;
  uri: string;
  is_dir: boolean;
}
