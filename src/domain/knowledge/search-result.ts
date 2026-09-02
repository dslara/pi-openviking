import type { KnowledgeItem } from "./knowledge-item";
import type { ResourceItem } from "./resource-item";
import type { SkillItem } from "./skill-item";

export interface SearchResult {
  memories: KnowledgeItem[];
  resources: ResourceItem[];
  skills: SkillItem[];
  total: number;
  queryPlan?: string;
}
