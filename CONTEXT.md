# pi-openviking — Context

## Purpose

Pi extension that integrates OpenViking as a **long-term memory and resource backend** for coding agents. Not a generic OV client — a focused memory plugin.

Pi owns session history, prompt orchestration, and tool execution. OpenViking owns long-term memory retrieval, resource storage, and memory extraction.

## Core Glossary

| Term | Meaning |
|------|---------|
| **pi** | The coding agent harness (session manager, tools, prompt builder) |
| **OV** | OpenViking server — context database with filesystem paradigm |
| **auto-recall** | Before each agent turn, inject relevant memories into systemPrompt via `<relevant-memories>` block. Deep mode when OV session exists, fast mode otherwise. Token budget ~500 tokens. Configurable per project (`openVikingAutoRecall`). Uses **Recall Curator** for multi-factor ranking, dedup, and budget trimming. |
| **Session Sync** | One-to-one mapping between a pi session and an OV session. Lazily creates OV session, streams user/assistant text-only messages incrementally. |
| **memsearch** | Tool: semantic search across OV memories, resources, and skills. Returns raw JSON (`total`, `memories`, `resources`, `skills`, `query_plan`). Supports `mode` (auto/fast/deep). Auto mode uses `Search Mode Resolver`. |
| **memread** | Tool: read content at a viking:// URI (L0 abstract, L1 overview, L2 full). Auto-detects level from stat (dir → overview, file → read). |
| **membrowse** | Tool: list/tree/stat the viking:// filesystem. |
| **memcommit** | Tool: commit current session to OV, triggering memory extraction. Fire-and-forget (returns task_id). |
| **memimport** | Tool: import resource or skill into OV. Sources: URLs, local files, local directories (via temp_upload + zip). Optional `kind: "resource" \| "skill"`. Fire-and-forget. |
| **memdelete** | Tool: remove by viking:// URI. No search-then-delete. |
| **Tool Definition** | Reusable factory (`defineTool`) for registering OpenViking tools with pi. Handles metadata wiring, optional URI validation, error wrapping, and `ToolResult` assembly. Tool executors provide only the unique logic. |
| **Transport** | Low-level HTTP module for OpenViking. Handles fetch, timeout/abort merge, JSON envelope parsing, and `OpenVikingError` classification. Interface: `request(methodLabel, path, opts?, signal?)`. |
| **Client Adapter** | `createClient` — maps domain operations (`search`, `read`, `fsList`, etc.) to transport calls. Knows endpoint paths, query/body assembly, and response normalization. |
| **Search Mode Resolver** | `resolveSearchMode` — decides between `fast` and `deep` for auto mode. Deep if session exists, else deep if query is complex (`?`, length ≥ 80, wordCount ≥ 8), else fast. |
| **Bootstrap** | `bootstrapExtension` — one-time setup per extension lifetime. Loads config, creates client and sessionSync, registers tools, wires auto-recall. Returns `{ sessionSync }` for lifecycle delegation. |
| **Recall Curator** | `curate` — multi-factor ranking and dedup pipeline for search results. Takes raw `SearchResult` + query + options, produces `CuratedItem[]`. Scoring: base + leaf boost (0.12) + temporal boost (0.10) + preference boost (0.08) + lexical overlap (max 0.20). Deduplicates by abstract for non-event categories, by URI for events/cases/resources. Prefers leaf items, truncates content, trims to token budget. Pure function — zero network calls, fully testable. |
| **Auto Recall Options** | Configurable parameters for `createAutoRecall`: `limit` (search results, default 10), `timeout` (ms, default 5000), `topN` (max memories injected, default 5). Set via `openVikingAutoRecallLimit/Timeout/TopN` in `.pi/settings.json` or env vars. |
| **Resource** | External knowledge (docs, code, URLs) stored under `viking://resources/` |
| **Skill** | Structured agent capability stored under `viking://agent/skills/` |
| **Memory** | Long-term knowledge extracted from sessions (profile, preferences, entities, events, cases, patterns) |

## Tool Surface

| Tool | Action | API Endpoints |
|------|--------|---------------|
| `memsearch` | Semantic search (fast/deep) with optional target_uri | `/api/v1/search/find`, `/api/v1/search/search` |
| `memread` | Read content at URI (L0/L1/L2) | `/api/v1/content/{abstract,overview,read}` |
| `membrowse` | ls, tree, stat | `/api/v1/fs/{ls,tree,stat}` |
| `memcommit` | Commit session, trigger memory extraction | `/api/v1/sessions/{id}/commit` |
| `memimport` | Import resource or skill (URL, file, dir) | `/api/v1/resources`, `/api/v1/skills`, `/api/v1/resources/temp_upload` |
| `memdelete` | Remove by URI | `DELETE /api/v1/fs` |

## Design Decisions

- Auto-recall and memsearch tool format search results differently **by design**: auto-recall produces compressed XML (`<relevant-memories>`) with dedup and token budget for system prompt injection; memsearch returns full JSON for agent reasoning. No shared formatter.

- Pi keeps its own session history. OV does **not** reassemble it (no `assemble()` / `compact()` pattern).
- Auto-recall runs on `before_agent_start` — searches OV with the user prompt, injects top results into systemPrompt with ~500 token budget.
- Auto-recall uses **deep** mode when OV session exists, **fast** when not.
- Auto-recall is **configurable per project** via `openVikingAutoRecall` setting (default true).
- Recall Curator options: `scoreThreshold` (0.15), `maxContentChars` (500), `preferAbstract` (true), `tokenBudget` (500) — configurable via settings/env vars.
- Session sync is incremental: each `message_end` appends text-only content to OV session.
- Async operations (commit, import) are fire-and-forget — return task_id but don't poll.
- No reranking in plugin — trust OV's internal pipeline.
- No grep/glob search — semantic search covers coding agent use cases.

## Deferred

- `session.used()` — track which contexts/skills agent consumed. Low priority, easy to add later.
- `grep`/`glob` search — can add if real need arises.
- Multi-namespace parallel search (user + agent memories) — single global search for now.

## Out of Scope (from OpenClaw plugin)

- `assemble()` history rebuild — pi manages its own history
- `compact()` synchronous commit + readback — pi uses manual memcommit
- `afterTurn()` auto-commit by token threshold — deferred to explicit user action
- VikingBot interaction endpoints
- WebDAV endpoints
- Admin/multi-tenant management
