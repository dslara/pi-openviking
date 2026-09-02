export interface KnowledgeItem {
  uri: string;
  text: string;
  abstract?: string;
  overview?: string;
  score?: number;
  category?: string;
  level?: number;
  modTime?: string;
  contextType?: "memory" | "resource" | "skill";
  matchReason?: string;
}
