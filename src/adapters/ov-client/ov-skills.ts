/**
 * OV wire-format response for POST /api/v1/skills.
 *
 * See OV 04-skills.md.
 */
export interface OVAddSkillResponse {
  status: string;
  root_uri: string;
  uri: string;
  name: string;
  auxiliary_files: number;
}
