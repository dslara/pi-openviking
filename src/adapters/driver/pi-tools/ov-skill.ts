import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SkillClient } from "../../../domain/client/open-viking-client";
import type { SkillData } from "../../../domain/ports/skill-store";
import type { Logger } from "../../../domain/ports/logger";

const SkillSchema = Type.Object({
  content: Type.String({ description: "Skill content (SKILL.md format with YAML frontmatter, or `content` field when using structured data)" }),
  wait: Type.Optional(Type.Boolean({ description: "Wait for skill processing to complete" })),
  name: Type.Optional(Type.String({ description: "Skill name (required when using structured SkillData)" })),
  description: Type.Optional(Type.String({ description: "Skill description (required when using structured SkillData)" })),
  allowedTools: Type.Optional(Type.Array(Type.String(), { description: "Tools the skill is allowed to use" })),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Tags for categorization" })),
});

export function createOvSkillTool(
  client: SkillClient,
  logger: Logger,
): ToolDefinition<typeof SkillSchema> {
  return defineTool({
    name: "ov_skill",
    label: "Save Skill",
    description: "Save a skill definition to the OpenViking knowledge base. Uses POST /api/v1/skills which auto-detects MCP tools, SKILL.md format, or structured skill data. Pass raw content as a string, or use name+description fields for structured SkillData.",
    promptSnippet: "ov_skill(content, wait?, name?, description?, allowedTools?, tags?) — save skill definition via OV skills API",
    parameters: SkillSchema,
    async execute(_toolCallId, params, signal) {
      const start = Date.now();
      try {
        const data: string | SkillData = params.name || params.description
          ? {
              name: params.name!,
              description: params.description!,
              ...(params.content ? { content: params.content } : {}),
              ...(params.allowedTools ? { allowedTools: params.allowedTools } : {}),
              ...(params.tags ? { tags: params.tags } : {}),
            }
          : params.content!;

        const result = await client.addSkill(data, { wait: params.wait }, signal ?? undefined);
        const durationMs = Date.now() - start;
        logger.info("ov_skill completed", { durationMs, name: result.name });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        const durationMs = Date.now() - start;
        logger.error("ov_skill failed", { durationMs, error: err instanceof Error ? err.message : String(err) });
        return {
          content: [{ type: "text" as const, text: `Skill save failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
