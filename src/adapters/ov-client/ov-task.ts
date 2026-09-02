/**
 * OV wire-format types for task endpoints.
 *
 * See OV 05-sessions.md get_task() and list_tasks() sections.
 */

export interface OVTaskResponse {
  task_id: string;
  task_type?: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  resource_id?: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string } | null;
  stage?: string | null;
  created_at?: number;
  updated_at?: number;
}
