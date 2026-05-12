export interface MemorySearchItem {
  text: string;
  score: number;
  uri: string;
  category?: string;
  abstract?: string;
  content?: string;
  overview?: string;
  level?: number;
  modTime?: string;
  [k: string]: unknown;
}

export interface ResourceSearchItem {
  uri: string;
  score: number;
  abstract?: string;
  [k: string]: unknown;
}

export interface SkillSearchItem {
  uri: string;
  score: number;
  abstract?: string;
  [k: string]: unknown;
}

export interface SearchResult {
  memories: MemorySearchItem[];
  resources: ResourceSearchItem[];
  skills: SkillSearchItem[];
  total: number;
  query_plan?: string;
  [k: string]: unknown;
}

export interface ReadResult {
  content: string;
  [k: string]: unknown;
}

export interface BrowseResult {
  uri: string;
  children: Array<{ uri: string; type: string; abstract?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export interface CommitResult {
  session_id: string;
  status: string;
  task_id: string;
  archive_uri: string;
  archived: boolean;
  trace_id: string;
}

export interface OpenVikingClient {
  createSession(signal?: AbortSignal): Promise<string>;
  sendMessage(sessionId: string, role: string, content: string, signal?: AbortSignal): Promise<void>;
  search(sessionId: string | undefined, query: string, limit?: number, mode?: "fast" | "deep", target_uri?: string, signal?: AbortSignal): Promise<SearchResult>;
  read(uri: string, level?: "abstract" | "overview" | "read", signal?: AbortSignal): Promise<ReadResult>;
  fsList(uri: string, signal?: AbortSignal, recursive?: boolean, simple?: boolean): Promise<BrowseResult>;
  fsTree(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  fsStat(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  commit(sessionId: string, signal?: AbortSignal): Promise<CommitResult>;
  delete(uri: string, signal?: AbortSignal): Promise<{ uri: string }>;
  addResource(params: { path?: string; temp_file_id?: string; parent?: string; reason?: string; kind?: "resource" | "skill" }, signal?: AbortSignal): Promise<{ root_uri: string; status: string; errors: string[] }>;
  tempUpload(fileBody: string | Uint8Array, filename: string, signal?: AbortSignal): Promise<{ temp_file_id: string }>;
}
