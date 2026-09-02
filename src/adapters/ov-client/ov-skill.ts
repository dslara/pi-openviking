/**
 * OV wire-format types for skill endpoints.
 *
 * See OV 04-skills.md.
 */

export interface OVSkillRequest {
  data?: string | Record<string, unknown>;
  temp_file_id?: string;
  wait?: boolean;
  timeout?: number;
  telemetry?: boolean | Record<string, unknown>;
}

export interface OVSkillQueueStatus {
  pending: number;
  processing: number;
  completed: number;
}

export interface OVSkillResponse {
  status: string;
  root_uri: string;
  uri: string;
  name: string;
  auxiliary_files?: number;
  queue_status?: OVSkillQueueStatus;
}
