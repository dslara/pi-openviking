/**
 * OV wire-format types for resource import endpoint.
 *
 * See OV 02-resources.md.
 */

export interface OVResourceImportResponse {
  status: string;
  root_uri: string;
  source_path: string;
  errors?: string[];
}
