# Ubiquitous Language (expanded reference)

> Canonical glossary: [`CONTEXT.md`](./CONTEXT.md)
> This file is an expanded reference with additional detail and examples. Terms defined in CONTEXT.md are authoritative; this file supplements with deeper explanations.

> Glossário da arquitetura Reborn (Fase 1+). Termos legado em `src/_legacy/` foram omitidos — este documento reflete apenas o novo design hexagonal.

## Systems & Actors

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Pi** | The coding agent harness that owns session history, prompt orchestration, and tool execution | pi-coding-agent, harness |
| **OpenViking** | The long-term memory server providing semantic search, resource storage, and memory extraction | OV, the server |
| **Agent** | The LLM instance orchestrated by Pi that uses tools and produces responses | model, LLM |
| **Extension** | A Pi plugin that registers tools and hooks into session lifecycle events | plugin, add-on |

## Architecture Layers

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Domain** | The innermost layer containing enterprise logic and port interfaces. Zero external dependencies. Lives under `src/domain/` | core, business layer |
| **Port** | An interface declared in the domain layer that an adapter must implement. Examples: `Logger`, `KnowledgeBase`, `SessionStore` | contract, interface |
| **Adapter** | An implementation of a **Port**, living in `src/adapters/`. **Driven** adapters implement domain ports (e.g. `FileLogger`); **Driver** adapters call domain ports (not yet present in Fase 1) | implementation, plugin |
| **Infrastructure** | Cross-cutting concerns: config loading, lifecycle wiring. Lives under `src/infrastructure/`. DI container removed in ADR-021 — dependencies created directly in `init()` | framework, wiring layer |

## Foundation (Config & DI)

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Config Schema** | The Zod schema that defines, validates, and provides defaults for all plugin configuration | schema, config definition |
| **Config Cascade** | Config resolution order: compiled defaults → env vars (`OV_*`) → `.pi/settings.json` → active **Profile**. Each source overrides the previous via shallow merge | merge, resolution chain |
| **Profile** | A named config preset containing `name` and `description` in Fase 1 (no OV-specific fields until Fase 4). One is always active | config profile, named preset |
| **Built-in Profile** | One of 4 shipped profiles: `default`, `web-dev`, `docs`, `learning` | stock profile, system profile |
| **Logger** | Interface in `domain/ports/logger.ts` with methods `info`, `warn`, `error`, `debug`. Implemented by `FileLogger` in `adapters/driven/logger/` | log, console |
| **File Logger** | Outputs JSON lines via `appendFileSync`. Rotates by size (10MB) and age (7 days), keeps up to 5 gzipped historical files | file logging, persistent logger |
| **DI Container** | **Removed in ADR-021 (Flat Hexagon).** Dependencies are now created directly in `init()` via `new Class(...)` — no container, no token registry, no service locator. `init()` returns a plain object with all wired instances. The old `container.ts` file and `infrastructure/di/` directory were removed | container, ioc, service locator |
| **Lifecycle** | The `init()` (async, creates logger + wires everything) and `shutdown()` (sync, resets state) entry points for the Foundation layer. No container — creates services and adapters directly via `new Class(...)`. F4 wiring: creates RecallCurator (with scorers), SessionManager (wired to SessionClient), RecallService (wired to KB + curator, enabled=true), SessionSync. 22 smoke tests at `lifecycle.test.ts` | bootstrap lifecycle, module lifecycle |
| **Bootstrap** | One-time startup that runs **Config Cascade**, creates **Logger**, creates all dependencies directly via `new Class(...)`, and returns a ready extension handle. No DI container (removed per ADR-021) | init, startup |

## Relationships

- The **Config Cascade** resolves config in order: defaults → env vars → `.pi/settings.json` → active **Profile**
- A **Profile** is a named preset in the **Config Schema**'s `profiles` record; exactly one is selected via `activeProfile`
- Dependencies are created directly in `init()` after **Config Cascade** resolves the final config — no DI container (removed in ADR-021)
- The **Logger** interface lives in `domain/ports/`; the **File Logger** implementation lives in `adapters/driven/logger/`
- The **File Logger** is created once in `init()` and passed to consumers via constructor injection — no DI container needed
- The **Config Schema** exports `PiOVConfig` type (inferred via `z.infer`) and `DEFAULT_CONFIG` constant — these are used by the **Config Cascade** as the base layer

## Shared Kernel (domain/common)

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Uri** | Value object class representing a `viking://` URI. Validates prefix in constructor, implements `.toString()` and `.equals()` (value comparison). Lives in `domain/common/uri.ts` | path, string identifier |
| **SessionId** | Opaque value object class for an OpenViking session. Guards against empty string, implements `.toString()`. Created by `SessionStore.create()`. Lives in `domain/common/session-id.ts` | session token, session key |
| **ContentLevel** | String literal union: `"abstract" \| "overview" \| "read"`. Used by `FsStore.read()` to control response detail. Lives in `domain/common/content-level.ts` | level, detail |
| **WriteMode** | String literal union: `"replace" \| "append" \| "create"`. Used by `FsStore.write()` to control overwrite behavior. Lives in `domain/common/write-mode.ts` | mode, write strategy |
| **FindQuery** | Interface for simple semantic search: `{ query, limit?, targetUri? }`. No session context. Maps to OV `POST /api/v1/search/find`. Lives in `domain/common/search-query.ts` | simple query |
| **SearchRequest** | Interface for deep search: `{ query, limit?, sessionId?, targetUri? }`. With optional session for intent analysis. Maps to OV `POST /api/v1/search/search`. Lives in `domain/common/search-query.ts` | deep query |
| **SearchOptions** | Interface for advanced search params: `{ scoreThreshold?, since?, until?, timeField?, level?, includeProvenance? }`. Optional bag alongside FindQuery/SearchRequest. Lives in `domain/common/search-query.ts` | advanced opts |
| **Part** | Discriminated union of `TextPart \| ToolPart \| ContextPart`. Represents a piece of content in an OV session message. Lives in `domain/common/part.ts` | message part, content part |
| **TextPart** | Interface `{ type: "text"; text: string }`. A plain text message part. | text segment |
| **ToolPart** | Interface `{ type: "tool"; toolId; toolName; toolInput; toolOutput; toolStatus; toolOutputTruncated; toolUri; skillUri; durationMs | null; promptTokens | null; completionTokens | null; toolOutputRef }`. A tool execution record. `toolStatus` is `string` (not enum) to support future OV values. | tool result |
| **ContextPart** | Interface `{ type: "context"; uri: string; contextType: "memory" \| "resource" \| "skill"; abstract: string }`. A referenced context item. | context reference |

## Domain Errors

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **DomainError** | Base class extending `Error`. All domain-layer errors inherit from it. Sets `this.name = this.constructor.name` automatically. Lives in `domain/errors/domain-error.ts` | generic Error |
| **NotFoundError** | Extends `DomainError`. Represents a resource that does not exist. Lives in `domain/errors/domain-error.ts` | 404, missing |
| **ConnectionError** | Extends `DomainError`. Represents a failure to connect to a remote service (e.g. OV unreachable). Lives in `domain/errors/domain-error.ts` | network error, timeout |
| **ValidationError** | Extends `DomainError`. Carries optional `details: Record<string, unknown>` for structured error info. Lives in `domain/errors/domain-error.ts` | invalid input, bad request |

## Domain Models

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **KnowledgeItem** | Interface describing a unit of persistent knowledge in OV. Fields: `uri`, `text`, optional `abstract`, `overview`, `score`, `category`, `level`, `modTime`. Lives in `domain/knowledge/model/knowledge-item.ts` | memory, document |
| **ResourceItem** | Interface for an OV resource reference: `uri`, optional `score`, `abstract`. Lives in `domain/knowledge/model/resource-item.ts` | file, resource |
| **SkillItem** | Interface for an OV skill reference: `uri`, optional `score`, `abstract`. Lives in `domain/knowledge/model/skill-item.ts` | tool, skill |
| **SearchResult** | Interface grouping search output: `memories: KnowledgeItem[]`, `resources: ResourceItem[]`, `skills: SkillItem[]`, `total: number`, optional `queryPlan`. Lives in `domain/knowledge/model/search-result.ts` | search response |
| **Relation** | Interface for a graph edge: `uri`, optional `reason`. Lives in `domain/knowledge/model/relation.ts` | link, edge |
| **RecallItem** | Interface for a curated search result: `item: KnowledgeItem`, `score: number`, `source: "search" | "graph"`. Lives in `domain/recall/model/recall-item.ts` | curated item |

## Port Interfaces (domain/ports/)

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **KnowledgeBase** | Port for semantic and lexical search. Methods: `find(FindQuery)`, `search(SearchRequest)`, `glob(pattern, uri?, limit?)`, `grep(pattern, opts?)`. Lives in `domain/ports/knowledge-base.ts` | search engine, KB |
| **FsStore** | Port for filesystem operations on OV virtual filesystem (merged with ContentStore). Methods: `read`, `write`, `list`, `tree`, `stat`, `mkdir`, `mv`, `delete`, `reindex` (rebuilds vector embeddings). No `wait` (synchronous wait is OV transport detail, resolved by adapter). Lives in `domain/ports/fs-store.ts` | content store, file system |
| **GraphStore** | Port for navigating relations. Methods: `link`, `unlink`, `graph`. Lives in `domain/ports/graph-store.ts` | relation store, graph db |
| **SessionStore** | Port for OV session lifecycle. Methods: `create`, `sendMessage`, `sendMessages`, `commit`, `getTaskStatus`, `listTasks`, `sessionUsed`, `deleteSession`. Lives in `domain/ports/session-store.ts` | session manager |
| **Logger** | Port for structured logging. Methods: `info`, `warn`, `error`, `debug`, `isEnabled`. Lives in `domain/ports/logger.ts` | log, console |

## Runtime Implementations

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Curate Pipeline** | Pure function `curate(SearchResult, CurateOpts): CuratedResult`. Steps: merge (memories + resources → CuratedItem[]), dedup, score-sort, apply scorers (optional, sum per item, re-sort), threshold filter + topN, trim-to-budget (~130 overhead + ~60 per-item token accounting). `estimateTokens(text): number` helper. Token count returned but caller manages allocation. Lives in `src/domain/recall/curate.ts` | curation, curator |
| **RecallCurator** | Thin wrapper class over pure `curate()` in `src/domain/recall/recall-curator.ts`. Constructor: `(config: RecallConfig, scorers: Scorer[], logger: Logger)`. Method `curate(results: SearchResult): CuratedResult` reads `topN`, `scoreThreshold`, `maxTokens` from config, delegates to pure `curate()`, emits log line. Wired into **GraphExpander** via RecallService in F8. Wired in `init()` as singleton `recallCurator` with empty scorers (F4). 6 tests. | curator, curation wrapper |
| **Scorer** | Type alias `(item: CuratedItem, query: string) => number`. Scorers refine base scoring — summed per item after initial sort, then re-sorted. Lives in `src/domain/recall/curate.ts`. | scoring function |
| **relevanceScorer** | Built-in scorer: keyword overlap between query tokens and item text+uri, case-insensitive. Returns `(hits/terms) * 0.5`. Max contribution +0.5. | keyword scorer |
| **temporalScorer** | Built-in scorer: exponential decay on `CuratedItem.modTime`. Formula `0.5 * exp(-daysAgo / 7)`. Half-life 7 days, max +0.5. Returns 0 if no modTime. | recency scorer |
| **CuratedItem** | Interface: `{ uri, text, score, source: "memory" \| "resource", category?, modTime? }`. `modTime` plumbed from `KnowledgeItem.modTime` during merge. Produced by curation pipeline. | curated result |
| **CurateOpts** | Interface: `{ topN, scoreThreshold, maxTokens, scorers?, query? }`. `scorers`: optional `Scorer[]`. `query`: string passed to scorers. Both optional — backward-compatible. | curation options, opts |
| **CuratedResult** | Interface: `{ items: CuratedItem[], tokens: number, dropped: number }`. Output of curation. | curation output |
| **OVAdapterConfig** | Zod sub-schema in `ConfigSchema.ov` (field `ov`). Defines server connection: `endpoint`, `apiKey`, `account`, `user`, `timeout`, `commitTimeout`, `maxRetries`, `rateLimitPerSecond`, `autoCommitIntervalMs`, `circuitBreaker`. Defaults: endpoint=`http://localhost:1933`, timeout=30s, maxRetries=3. Lives in `infrastructure/config.ts`. | ov config, transport config |
| **RecallConfig** | Zod sub-schema in `ConfigSchema.recall` (field `recall`). 11 fields: `targetUri` (string?, undefined=global), `topN` (int, default 8), `scoreThreshold` (0-1, default 0.5), `maxTokens` (int, default 4000), `expandGraph` (bool, default true), `expandGraphDepth` (literal 1), `expandGraphMaxRatio` (0-1, default 0.2), `expandGraphMinSeedScore` (0-1, default 0.4), `searchMode` (`find`\|`search`, default `search`), `recallSearchTimeout` (int, default 10000), `autoRecall` (bool, default true). Env vars: `OV_TOP_N`, `OV_SCORE_THRESHOLD`, `OV_TARGET_URI`, `OV_EXPAND_GRAPH`, `OV_SEARCH_MODE`. Lives in `infrastructure/config/schema.ts`. | recall config, recall options |
| **Transport** | HTTP client class in `adapters/driven/openviking/transport.ts`. Wraps native `fetch()` with auth headers, exp-backoff retry (5xx/network), timeout, AbortSignal passthrough. Single method `request<T>(methodLabel, path, opts?, signal?)`. 13+ tests. | http client, fetcher |
| **ErrorMapper** | Pure function `toDomainError(httpStatus, body, methodLabel): DomainError` in `adapters/driven/openviking/mappers/ov-mappers.ts` (consolidated from `error-mapper.ts`). Maps: 401/403→ConnectionError, 404→NotFoundError, 409/422→ValidationError, 5xx→ConnectionError. 11 tests. | error translator, http error handler |
| **ContentMapper** | Pure function `toContent(raw, uri, level?): Content` in `adapters/driven/openviking/mappers/ov-mappers.ts` (consolidated from `content-mapper.ts`). Converts OV content JSON to domain `Content` (Uri + body + level). Handles null body, extra fields. 8 tests. | content parser, response mapper |
| **FsStoreAdapter** | Full implementation of `FsStore` port in `adapters/driven/openviking/fs-store.ts`. read+write+list+tree+stat+mkdir+mv+delete+reindex implemented. `write()` uses `wait: false` (async — OV processes embedding in background). `delete()` auto-retries with `recursive=true`. 22+ tests. | fs adapter, content adapter |
| **FsStoreService** | **Eliminated in ADR-021 (Flat Hexagon).** Tools call the `FsStore` port directly via the `FsClient` sub-interface of `OpenVikingClient`. No pass-through service layer. The old class at `domain/services/fs-store-service.ts` was deleted. | fs handler |
| **AutoCommit**| Replaced by `SessionSync` in ADR-021 (Flat Hexagon). The auto-commit timer is now managed as instance state in `SessionSync` at `domain/services/session-sync-service.ts`. | auto-commit timer, commit scheduler |
| **pollCommit** | Polling logic extracted from AutoCommit. Checks `GET /api/v1/tasks/{id}` until `completed`/`failed` or timeout. Lives in `register-lifecycle-hooks.ts`, used by `SessionSync`. | commit poller |
| **RepoContext** | Infrastructure module at `infrastructure/repo-context.ts`. Fetches `viking://resources/` via `FsStore.list()` on `session_start`, caches with 5min TTL. Injects resource index (📁/📄 lines + tool guidance) into system prompt via `before_agent_start` hook's `systemPrompt` field. Returns empty string when no repos indexed. | repo lister, context service |
| **LoggingMiddleware** | **Removed in ADR-021 (Flat Hexagon).** Tools now use inline try/catch + logger. The `domain/pipeline/` directory was deleted. | middleware, logger middleware |
| **Typed Mappers** | Design pattern after mapper consolidation: mappers accept typed OV wire-format inputs (e.g. `OVFindResponse`, `OVSessionInfo`) instead of `raw: unknown`. The `mapper-utils.ts` guard functions (`getRecord`, `safeString`, etc.) were removed — transport layer guarantees non-null responses on success paths. Each mapper accesses fields directly on the typed object with `?? undefined` for optional-to-optional conversions. | guard functions, safe-utils |
| **Tool barrel** / **registerAllTools** | Batch tool registration at `adapters/driver/pi-tools/tool-registry.ts`. Registers 14 tools with inline error handling — no Pipeline, no LoggingMiddleware (removed per ADR-021). Receives `ClientServices` with OpenVikingClient sub-interfaces. | tool registration, tool factory |
| **Command barrel** / **registerAllCommands** | Batch command registration at `adapters/driver/pi-commands/command-registry.ts`. Registers all 9 slash commands in one call. Receives `CommandServices` with all service deps plus optional `widgetUpdater` callback. | command registration, command factory |
| **FsMapper** | Pure functions in `adapters/driven/openviking/mappers/fs-mapper.ts`: `toFsEntry(raw)` validates type and returns `FsEntry`; `toFsEntries(raw)` maps arrays, null-safe; `toWriteResult(raw, uri)` infers success from `success` flag or `status` field. 15+ tests. | fs response mapper |
| **SearchClient** | Sub-interface of `OpenVikingClient` for semantic and lexical search. Methods: `find(FindQuery)`, `search(SearchRequest)`, `glob(pattern, uri?, limit?)`, `grep(pattern, opts?)`. Added in ADR-021 as a sub-interface replacing direct KnowledgeBase port calls from tools. | search, KB |
| **FsClient** | Sub-interface of `OpenVikingClient` for filesystem operations on OV virtual filesystem. Methods: `read`, `save`, `mkdir`, `mv`, `list`, `tree`, `stat`, `delete`, `reindex`. Added in ADR-021 replacing FsStoreService pass-through. | fs, filesystem |
| **SessionClient** | Sub-interface of `OpenVikingClient` for OV session lifecycle. Methods: `createSession`, `sendMessage`, `sendMessages`, `commit`, `getSession`, `getTaskStatus`, `sessionUsed`, `deleteSession`, `listSessions`. Added in ADR-021. | session |
| **RelationClient** | Sub-interface of `OpenVikingClient` for navigating relations. Methods: `link`, `unlink`, `graph`. Added in ADR-021. | relations |
| **ResourceClient** | Sub-interface of `OpenVikingClient` for importing external resources. Method: `importUrl`. Added in ADR-021. | resource import |
| **SkillClient** | Sub-interface of `OpenVikingClient` for saving skills. Method: `addSkill`. Added in ADR-021. | skills |
| **OpenVikingClient** | Unified hexagon-facing interface composing 6 sub-interfaces: `SearchClient`, `FsClient`, `SessionClient`, `RelationClient`, `ResourceClient`, `SkillClient`. Defined in `src/domain/client/open-viking-client.ts`. Adapter at `src/adapters/driven/openviking/client/client-adapter.ts`. Added in ADR-021 to eliminate 8 separate pass-through services. | big client, god object |
| **SessionSync** | Domain service at `domain/services/session-sync-service.ts`. Manages lifecycle coordination: auto-commit timer, dirty-flag tracking, commit retry with skip-on-shutdown logic. Depends on `SessionManager` + circuit breaker state. Added in ADR-021 to replace inline lifecycle coordination in `register-lifecycle-hooks.ts`. | session lifecycle manager |
| **KnowledgeBaseAdapter** | Implementation of `KnowledgeBase` port in `adapters/driven/openviking/knowledge-base.ts`. `find()`→`POST /search/find`, `search()`→`POST /search/search` c/ session_id, `glob()`→`POST /search/glob`, `grep()`→`POST /search/grep` c/ all filters. 13+ tests. | kb adapter, search adapter |
| **SessionMapper** | Pure functions in `adapters/driven/openviking/mappers/session-mapper.ts`. `toSessionId(raw)` extracts session identifier; `toCommitResult(raw)` maps commit; `toTaskStatus(raw)` maps task status. Includes `serializePart`/`serializeParts` for camelCase→snake_case Part serialization. 15+ tests. | session parser |
| **SessionStoreAdapter** | Full implementation of `SessionStore` port in `adapters/driven/openviking/session-store.ts`. All 8 methods: create, sendMessage, sendMessages, commit, getTaskStatus, listTasks, sessionUsed, deleteSession. 11 tests. | session adapter |
| **SessionManager** | Renamed from SessionService in ADR-021 (Flat Hexagon). Stateful domain service in `domain/services/session-service.ts`. Owns the active OV session. Methods: `createAndSet()`, `getActive()`, `sendMessage()`, `sendMessages()`, `commit()`, `waitForCommit()`, `deleteSession()`, `getSession()`, `sessionUsed()`. Depends on `SessionClient` (sub-interface of `OpenVikingClient`) + `SessionManagerConfig { commitTimeout, pollInterval? }`. `commit()` returns `{ taskId }` immediately. `waitForCommit()` polls `getTaskStatus()` at configurable interval. Wired in `init()` as `sessionService` with `commitTimeout` from `config.ov.commitTimeout`. 9+ tests. | session handler |
| **RelationMapper** | Pure functions in `adapters/driven/openviking/mappers/relation-mapper.ts`. `toLinkResult(raw, source, targets, reason?)` builds `LinkResult`; `toRelations(raw)` maps OV graph response (array or `{relations}` shape). 9+ tests. | relation parser |
| **GraphStoreAdapter** | Implementation of `GraphStore` port in `adapters/driven/openviking/graph-store.ts`. `link()`→`POST /relations/link`, `unlink()`→`DELETE /relations/link`, `graph()`→`GET /relations?uri=`. 8 tests. | graph adapter |
| **RecallCurator** | Thin wrapper class over pure `curate()` function in `domain/recall/recall-curator.ts`. Constructor: `(config: RecallConfig, scorers: Scorer[], logger: Logger)`. Single method `curate(results: SearchResult): CuratedResult` reads opts from config, builds `CurateOpts`, delegates to pure `curate()`, emits log line. Wired into **GraphExpander** via RecallService in F8. 6 tests. | curator, curation wrapper |
| **GraphExpander** | Concrete class at `domain/recall/graph-expander.ts`. Enriches recall by reading relations + abstracts of top-scoring curated items. Config: `expandGraphMaxRatio` (default 0.2 of budget), `expandGraphMinSeedScore`. Seed selection: items with score ≥ threshold, top 3 by score. Fetches via parallel `graph()` on GraphStore + `read("abstract")` on FsStore. Drops seen URIs across seeds. Max 20% of original budget. Score decayed 0.8×. Items tagged with source `"graph"`. 3 unit + 1 integration test. | graph augmenter, relation expander |
| **Batch Message** | The `sendMessages(parts)` method on `SessionManager` → `SessionClient.sendMessages()` → `POST /api/v1/sessions/{id}/messages/batch`. Sends multiple messages in one API call. Body format: `{ messages: [{ role, parts: [...] }] }` (parts replaces legacy content field). Used by F6 session sync for batch archival. | batch send, bulk message |
| **Command Factory Pattern** | Each slash command is a `create*Command(svc, ...)` function returning an options object compatible with `pi.registerCommand()`. Commands call services directly — no middleware (pipeline removed per ADR-021). Files live in `adapters/driver/pi-commands/`. Barrel export `command-registry.ts` provides `registerAllCommands(pi, services)`. 9 commands, 34+ tests. | command handler, command factory |
| **/ov-recall command** | Registered via `pi.registerCommand("ov-recall", ...)`. Toggles `RecallService.setEnabled()`. Validates `on|off` arg, provides completions. Lives in `adapters/driver/pi-commands/ov-recall-command.ts`. 6 tests. | recall toggle command |
| **/ov-status command** | Registered via `pi.registerCommand("ov-status", ...)`. Reads OV connection endpoint, active session, recall toggle state, target scope, and search mode from services. Displays via `ctx.ui.notify()`. Lives in `adapters/driver/pi-commands/ov-status-command.ts`. 2 tests. | status command |
| **/ov-tree command** | Registered via `pi.registerCommand("ov-tree", ...)`. Calls `fsClient.tree(uriStr)` directly via `FsClient` (sub-interface of `OpenVikingClient`). Defaults to `viking://`. Formats result as indented tree. Lives in `adapters/driver/pi-commands/ov-tree-command.ts`. 5 tests. | tree command |
| **/ov-commit command** | Registered via `pi.registerCommand("ov-commit", ...)`. Calls `sessionService.commit()`. Optional `--wait` flag triggers `sessionService.waitForCommit()`. Shows warning if no active session. Lives in `adapters/driver/pi-commands/ov-commit-command.ts`. 5 tests. | commit command |
| **/ov-search command** | Registered via `pi.registerCommand("ov-search", ...)`. Calls `searchService.search()` in fast mode. Formats results as URI + score + abstract lines. Lives in `adapters/driver/pi-commands/ov-search-command.ts`. 6 tests. | search command |
| **/ov-delete command** | Registered via `pi.registerCommand("ov-delete", ...)`. Shows `ctx.ui.confirm()` before calling `fsClient.delete()` via `FsClient`. Validates URI. Supports glob patterns. Lives in `adapters/driver/pi-commands/ov-delete-command.ts`. 5 tests. | delete command |
| **/ov-reindex command** | Registered via `pi.registerCommand("ov-reindex", ...)`. Calls `fsStoreService.reindex()`. Validates URI, provides `--mode` completions (`vectors_only`|`full`). Lives in `adapters/driver/pi-commands/ov-reindex-command.ts`. 5 tests. | reindex command |
| **/ov-start command** | Registered via `pi.registerCommand("ov-start", ...)`. Calls `sessionService.createAndSet()`. Notifies user of new session ID. Lives in `adapters/driver/pi-commands/ov-start-command.ts`. | start session command |
| **/ov-profile command** | Registered via `pi.registerCommand("ov-profile", ...)`. Manages profile lifecycle: `show` (active profile + behavior), `list` (all profiles, active marked), `apply <name>` (switch profile), `detect` (auto-detect from cwd). Uses `ProfileManager`. Lives in `adapters/driver/pi-commands/ov-profile-command.ts`. 13+ tests. | profile command |
| **CircuitBreaker** | Pure reducer (`circuit-breaker.ts`) + Transport decorator. States: CLOSED → `threshold` (default 3) → OPEN (reject instantly with `ConnectionError`) → `resetTimeoutMs` (default 30s) → lazy TICK (at start of next `Transport.request()`) → HALF_OPEN (probe) → success=CLOSED, failure=OPEN+×2 (capped at `maxResetTimeoutMs`, default 300s). Driven by real failures (5xx/network/timeout), not health check. Config in `OVAdapterConfig.circuitBreaker? { threshold, resetTimeoutMs, maxResetTimeoutMs }`. Env vars: `OV_CIRCUIT_BREAKER_THRESHOLD`, `OV_CIRCUIT_BREAKER_RESET_TIMEOUT`. 10 reducer tests + 4 Transport integration tests. Issue #74. | cb, breaker |
| **HealthCheck** | Adapter at `adapters/driven/openviking/health.ts`. Probes `GET /ready` via direct `fetch()` (bypasses CircuitBreaker Transport). Method `check(): Promise<HealthStatus>` returns `{ ok, latencyMs?, error? }`. Feeds `OVWidget.update("conn", ...)`. Called on `session_start` and on-demand. Does NOT drive CircuitBreaker. 4 tests. | health probe, ping, liveness |
| **MessageMapper** | Pure function `agentMessageToParts(msg: { role, content? }): Part[]` at `adapters/driver/pi-lifecycle/message-mapper.ts`. Converts Pi AgentMessage to domain TextPart[] for session sync. Only user/assistant text parts; ignores ImageContent, tool/custom/bash roles, empty/whitespace content. 9+ tests. Issue #76. | message converter |
| **ProfileBehavior** | 6 optional behavioral fields on a Profile: `targetUri`, `topN`, `scoreThreshold`, `searchMode`, `expandGraph`, `autoRecall`. Override RecallConfig when profile active. Added in F7a. | behavioral fields, profile options |
| **ProfileManager** | Stateful service (F7a). Methods: `getActive()`, `resolve(name)`, `apply(name)`. Cascade merges `resolve()` as last override layer. `activeProfile` from config file; `/ov-profile` command in F7b. | profile resolver, profile handler |
| **AutoDetect** | Minimatch rules-based profile detection (F7b). `detect(cwd, rules): string | null`. Built-in rules map project patterns to profiles. Runs when `activeProfile = "auto". Regex-based glob matcher with globstar (`**`) support. No external dependencies. Lives in `domain/profile/service/auto-detect.ts`. | auto profile, profile detection |
| **Session Context** | Deferred concept (ADR-016). Three OV endpoints (`GET /sessions/{id}/context`, `GET /sessions/{id}/archives/{archive_id}`, `POST /sessions/{id}/extract`) deliberately NOT implemented. Pi is source of truth for conversation history — session context serves crash recovery/audit trail, none with concrete consumers. Easy to add later if Pi adds `resume_from_ov` feature. | session archive, session extract |
| **Auto-actions** | Eliminated concept (ADR-015). Originally proposed F8.1 with heuristic regex Analyzer + Proposer + Executor for auto-save. Rejected in favor of OV's native memory extraction (via commit) + explicit `ov_write` tool. OpenClaw pattern: commit → OV server extracts memories into categories. No Analyzer class, no autoSaveMode/autoLinkMode fields. | heuristic auto-save, auto-actions pipeline |
| **F6 hooks** | 5 Pi lifecycle hooks in `index.ts` wiring domain services to agent lifecycle. `context` → `RecallService.recall()` injects `<relevant-memories>` block before each LLM call with query-hash cache. `before_agent_start` → `RepoContext.getSystemPromptSnippet()` injects resource index. `message_end` → `SessionManager.sendMessage()` syncs user messages to OV. `turn_end` → `SessionManager.sendMessage()` syncs assistant messages. `session_shutdown` → `SessionManager.commit()` triggers OV memory extraction. `session_start` → health check. | lifecycle hooks, agent hooks |

## Example dialogue

> **Dev:** "I want to understand the full lifecycle of an agent session."
>
> **Domain expert:** "On `session_start`, three things happen: **HealthCheck** probes OV via `GET /ready`, **RepoContext** fetches `viking://resources/` and caches with 5min TTL for the system prompt, and **SessionManager.createAndSet()** creates a new OV session. The **OVWidget** shows connection status and session ID."
>
> **Dev:** "What happens before each LLM call?"
>
> **Domain expert:** "The **F6** `context` hook calls **RecallService.recall()** — it searches, curates via **RecallCurator**, optionally expands via **GraphExpander**, and injects a `<relevant-memories>` block. Results are cached by query hash to avoid redundant OV traffic within the same turn."
>
> **Dev:** "And messages are synced back to OV through which service?"
>
> **Domain expert:** "**FsClient** (via `OpenVikingClient`) handles all content operations — save, read, list, tree, stat, delete, reindex. For session sync, the `message_end` and `turn_end` hooks invoke **SessionManager.sendMessage()**. On `session_shutdown`, **SessionManager.commit()** triggers OV memory extraction in the background, while **SessionSync** manages the auto-commit timer."
>
> **Dev:** "What if OV is down?"
>
> **Domain expert:** "The **CircuitBreaker** opens after 3 consecutive failures, rejecting requests instantly. After 30s, a lazy TICK moves to HALF_OPEN for a probe. If the probe succeeds, the circuit closes. Meanwhile, **Auto-Recall** skips silently when the circuit is open — no spurious errors in the agent's context."

## Flagged ambiguities

- **"Profile"** is overloaded three ways: (1) **Profile** — a named config preset in the Foundation layer (default, web-dev, docs, learning), (2) OV's internal `cProfile` concept (the server's own profiling mode), (3) a memory category extracted from sessions ("category: profile"). Use **Config Profile** for the Foundation concept, **OV cProfile** for the server concept, and **Memory Profile** for extracted user preferences.
- **"ProfileBehavior"** is a subset of Profile that overrides `RecallConfig`. Not to be confused with **Memory Profile** (OV's memory category) or **Profile** (the named config itself).
- **"Auto-Recall"** refers to the F6 `context` hook that calls `RecallService.recall()` automatically before each LLM call (see ADR-019). Not to be confused with **RecallService** (the domain service class, born in F4) or **RecallCurator** (the curation wrapper).
- **"Logger"** can refer either to the `Logger` interface in `domain/ports/` or the `FileLogger` implementation in `adapters/driven/`. Prefer **Logger Interface** vs **File Logger** when disambiguation matters.
- **"Config"** without qualification refers to the plugin's configuration managed by the **Config Schema**. Not to be confused with Pi's own settings (`.pi/settings.json`) or OV's server configuration.
- **"application/"** layer is empty and will remain empty. Application services live in `domain/services/`. F6 hooks live in `index.ts`.
- **"sendMessages" vs "sendMessage"** — `sendMessages` (batch, plural) sends multiple messages in one API call via `POST /messages/batch`. `sendMessage` (singular) sends one at a time. Both exist on `SessionStore` port; `sendMessages` was added in F5 and is preferred for archival efficiency.
- **"expandGraph"** is both a `RecallConfig` field (boolean, default true) and a `ProfileBehavior` field (boolean override). Same concept — profile overrides config at merge time. No ambiguity between them, but be precise about which layer sets the value.
- **"Auto-actions"** was the eliminated F8.1 concept (heuristic regex auto-save). Not to be confused with **Auto-Recall** (F6 hook, still active) or **AutoDetect** (F7b, profile detection by path). Three different "auto" features, only two remain.
- **"FsService/WriteService/ReadService"** no longer exist as separate classes — consolidated into **FsStoreService** (commit cbdbe5a), then **FsStoreService itself was eliminated** in ADR-021. Tools now call the `FsStore` port directly via the `FsClient` sub-interface of `OpenVikingClient`. References in old docs or issues to the three-way split or to FsStoreService are stale.
- **"ErrorMapper/ContentMapper"** no longer live in their own files — consolidated into `adapters/driven/openviking/mappers/ov-mappers.ts` (commit be5bace). The individual `error-mapper.ts` and `content-mapper.ts` files were removed. Other mappers (FsMapper, SearchMapper, SessionMapper, RelationMapper) remain in their own files.
- **"AutoCommit"** was a timer-based infra side effect in `register-lifecycle-hooks.ts`, replaced by **SessionSync** in ADR-021. `SessionSync` manages the auto-commit timer as instance state. Not to be confused with **/ov-commit** (the manual user command) or **commit()** (the domain method on SessionManager).
- **"SystemStatusClient"** is a driven adapter in `adapters/driven/openviking/system-status.ts` that calls `GET /api/v1/system/status`. Injected into `/ov-status` command to show live server status. Never throws — returns `{ initialized: false }` on error.
- **"Re-hydrate"** refers to populating a new OV session with recent Pi session history on `resume` or `fork`. Done in `handleSessionStart()` via `sessionService.sendMessages()`. Only processes last 50 `user`/`assistant` entries.
- **"session_before_switch"** is a Pi lifecycle hook that fires before `/new` or `/resume`. Commits OV session with retry logic. On failure, prompts user. Sets `skipShutdownCommit` flag on success.
- **"skipShutdownCommit"** is a module-level boolean flag in `register-lifecycle-hooks.ts`. Set by `session_before_switch` on successful commit, consumed by `session_shutdown` to avoid double-commit. Reset after consumption. Exported `resetModuleState()` for tests.
- **"Advanced search params"** refers to the 6 optional fields on `ov_search` tool: `scoreThreshold`, `since`, `until`, `timeField`, `level`, `includeProvenance`. Passed through `SearchOptions` interface to OV `find`/`search` endpoints. Previously required raw HTTP calls.
