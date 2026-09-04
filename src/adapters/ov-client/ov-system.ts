/**
 * OV wire-format types for system endpoints.
 *
 * See OV 07-system.md.
 */

export interface OVSystemStatusResponse {
  initialized: boolean;
  user?: string;
}
