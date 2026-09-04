# pi-openviking — Context

> Pi extension that integrates OpenViking as a long-term memory and resource backend for coding agents.
> Not a generic OV client — a focused memory plugin.

Architecture decisions: see `docs/adr/`.

## Language

### Systems & Actors

**Pi**:
Coding agent harness that owns session history, prompt orchestration, and tool execution.
_Avoid_: pi-coding-agent, harness

**OpenViking (OV)**:
Long-term memory server providing semantic search, resource storage, and memory extraction.
_Avoid_: the server, OV server

**Extension**:
A Pi plugin that registers tools and hooks into session lifecycle events.
_Avoid_: plugin, add-on

**Agent**:
The LLM instance orchestrated by Pi that uses tools and produces responses.
_Avoid_: model, LLM

### Architecture Layers

**Domain**:
Innermost layer containing enterprise logic and port interfaces. Zero external dependencies. Lives under `src/domain/`.
_Avoid_: core, business layer

**Port**:
An interface declared in the domain layer that an adapter must implement.
_Avoid_: contract

**Adapter**:
An implementation of a Port, living in `src/adapters/`. **Driven** adapters implement domain ports (e.g. FileLogger); **Driver** adapters call domain ports (e.g. Pi Event Bridge).
_Avoid_: implementation, plugin

**Infrastructure**:
Cross-cutting concerns: config loading, lifecycle wiring. Lives under `src/infrastructure/`. DI container was removed in ADR-021 — dependencies are created directly in `init()`.
_Avoid_: framework, wiring layer

### Foundation (Config & DI)

**Config Schema**:
The Zod schema that defines, validates, and provides defaults for all plugin configuration. Single source of truth. Exports `PiOVConfig` type inferred via `z.infer`. Domain-facing config interfaces live in `domain/common/` as plain TypeScript interfaces (`RecallConfig`, `ProfileConfig`, `ProfileBehavior`). Infra Zod schemas export inferred types under distinct names (`RecallConfigSchemaType`, `ProfileConfigSchemaType`).

Consolidated from 5 files to 1 file (`src/infrastructure/config.ts`) in ADR-021 (Flat Hexagon). The infra `config/` directory with separate `schema.ts`, `cascade.ts`, `loader.ts`, `profile-schema.ts`, `logger-schema.ts` was flattened into a single file. All schemas (logger, profile, circuit breaker, OV adapter, recall) plus `loadConfig()` and `mergeBehaviorIntoRecall()` live in one place.
_Avoid_: schema, config definition

**OVAdapterConfig**:
A sub-schema of Config Schema (field `ov`) that defines server connection parameters: `endpoint`, `apiKey`, `account`, `user`, `agentId`, `timeout`, `commitTimeout`, `maxRetries`, `rateLimitPerSecond`. Validated via Zod with sensible defaults (endpoint = `http://localhost:1933`, agentId = `"pi"`, timeout = 30s, maxRetries = 3, rateLimitPerSecond = 0 [disabled]). When > 0, Transport uses TokenBucket to throttle requests.
_Avoid_: ov config, transport config

**Transport**:
An HTTP client class (`Transport`) that wraps native `fetch()` with auth headers (`X-API-Key`, `X-OpenViking-Account`, `X-OpenViking-User`, `X-OpenViking-Agent`), exponential backoff retry (5xx/network), configurable timeout, AbortSignal passthrough, and TokenBucket rate limiter. Abort/timeout errors during rate limiter wait are caught and converted to `ConnectionError` — the request method never throws raw `DOMException`. Single method `request<T>(methodLabel, path, opts?, signal?)`. Lives in `adapters/driven/openviking/transport.ts`.
_Avoid_: http client, fetcher

**CircuitBreaker**:
A decorator wrapper inside `Transport` that protects against OV unavailability. States: **CLOSED** (normal) → `threshold` failures (default 3) → **OPEN** (rejects instantly with `ConnectionError`) → `resetTimeoutMs` (default 30s, configurable) → timeout elapses → next request triggers **lazy TICK** → **HALF_OPEN** (allows 1 probe request) → success = back to CLOSED, failure = back to OPEN with `resetTimeoutMs × 2` (capped at `maxResetTimeoutMs`, default 300s). The lazy TICK check runs at the start of each `Transport.request()` — no timers or polling. Circuit breaker is driven by real request failures — not by health check. Config lives in `OVAdapterConfig.circuitBreaker? { threshold: number, resetTimeoutMs: number, maxResetTimeoutMs: number }`. Env vars: `OV_CIRCUIT_BREAKER_THRESHOLD`, `OV_CIRCUIT_BREAKER_RESET_TIMEOUT`. Module at `adapters/driven/openviking/circuit-breaker.ts`. 10 pure reducer tests + 4 Transport integration tests. Issue #74.
_Avoid_: cb, breaker, fault tolerance

**HealthCheck**:
An adapter (`adapters/driven/openviking/health.ts`) that probes OV availability. Constructor accepts optional `apiKey`. When apiKey is provided, `check()` hits `GET /api/v1/sessions` with auth headers (fast, ~77ms) instead of `/ready` (which is known broken — always returns 503 after 10s). Without apiKey, falls back to `/ready` with 3s timeout. Method `check(timeoutMs?): Promise<HealthStatus>` returns `{ ok: boolean, latencyMs?: number, error?: string }`. Uses direct `fetch()` — does NOT go through the CircuitBreaker-decorated Transport. Health check is NOT called during normal operation — circuit breaker drives health detection via real request failures. Removed from `handleSessionStart` (no delay on session start).
_Avoid_: health probe, ping, liveness

**ErrorMapper**:
A pure function `toDomainError(httpStatus, body, methodLabel)` that translates OV HTTP errors into typed `DomainError` subtypes: 401/403 → `ConnectionError`, 404 → `NotFoundError`, 409/422 → `ValidationError`, 5xx → `ConnectionError`. Lives in `adapters/driven/openviking/mappers/ov-mappers.ts`.
_Avoid_: error translator, http error handler

**ContentMapper**:
A pure function `toContent(raw, uri, level?)` that converts OV content endpoint JSON into domain `Content` (typed `Uri` object + `body` string + optional `level`). Handles all three levels (read/abstract/overview). Extracts `body` from response, falls back to empty string on null. Lives in `adapters/driven/openviking/mappers/ov-mappers.ts`.
_Avoid_: content parser, response mapper

**SessionMapStore** (infrastructure adapter — `adapters/driven/session-map/session-map-store.ts`):
A file-based adapter that persists the Pi↔OV session mapping across restarts.
Writes `openviking-session-map.json` to the data directory. Exposes port interface
`SessionMapStore` in `domain/ports/session-map-store.ts`: `load(): Promise<Record<string, SessionMeta>>`,
`save(map: Record<string, SessionMeta>): Promise<void>`. Per-session metadata includes
`ovSessionId`, `syncedMessageKeys`, `lastCommitTime`, `commitInFlight`.
_Avoid_: session map file, session persistence

**AutoCommit** (infrastructure — lifecycle module):
A `setInterval`-based timer that periodically checks all active session mappings for
uncommitted messages and starts background commits. Lives in `register-lifecycle-hooks.ts`,
not as a standalone class — the timer coordination is an infra side effect.
Polls `GET /api/v1/tasks/{id}` to wait for commit completion. Started on plugin init,
stopped on `session_shutdown`. Polling logic extracted as pure function `pollCommit()`
for testability.
_Avoid_: auto-commit timer, commit scheduler

**RepoContext** (infrastructure — infra module):
Fetches `viking://resources/` via `GET /api/v1/fs/ls` on `session_start`, caches with
TTL, and injects indexed repo list + tool guidance into the system prompt via
`before_agent_start`'s `systemPrompt` field. No output when no repos indexed.
_Avoid_: repo lister, context service

**FsStoreAdapter**:
A concrete adapter class in `adapters/driven/openviking/fs-store.ts` (port `FsStore` was deleted in ADR-021 — tools call this via `FsClient`). `read()` maps level to official OV content endpoints: `level=read` → `/api/v1/content/read?uri=X&offset=Y&limit=Z`, `level=abstract` → `/api/v1/content/abstract?uri=X`, `level=overview` → `/api/v1/content/overview?uri=X`. Abstract/overview endpoints only work on directories — calling them on a file returns 412 FAILED_PRECONDITION which propagates to the caller. `write()` calls `POST /api/v1/content/write` with `wait: false` (async — OV processes embedding in background). Navigation methods (`list`, `tree`, `stat`) call `GET /api/v1/fs/{ls|tree|stat}`. Management methods (`mkdir`, `mv`) use POST with URI payload. `delete()` calls `DELETE /api/v1/fs?uri=` and auto-retries with `recursive=true` on recursive-required errors. `reindex()` calls `POST /api/v1/content/reindex {uri, mode}` with `mode` defaulting to `"vectors_only"`.

**FsMapper**:
Pure functions in `adapters/driven/openviking/mappers/fs-mapper.ts`: `toFsEntry(raw: OVFsEntry)` extracts `uri`, `type` (from `isDir`), `size`, `modTime` and returns domain `FsEntry`; `toFsEntries(raw: OVFsEntry[])` maps arrays; `toWriteResult(raw: OVWriteResponse, expectedUri)` returns `success: true` (HTTP 2xx implies success).

**SearchMapper**:
Pure functions in `adapters/driven/openviking/mappers/search-mapper.ts`: `toSearchResult(raw: OVFindResponse)` maps OV search response into domain `SearchResult`, extracting `contextType` and `matchReason` from each `MatchedContext`; `toGlobResult(raw: OVGlobResponse)` maps `matches`→`entries`, `count`→`total`; `toGrepResult(raw: OVGrepResponse)` maps `OVGrepMatch{uri,line,content}` → domain matches with `lineNumber`/`line`.
_Avoid_: search parser, search response mapper

**KnowledgeBaseAdapter**:
A concrete adapter class in `adapters/driven/openviking/knowledge-base.ts` (port `KnowledgeBase` was deleted in ADR-021 — tools call this via `SearchClient`). `find()` calls `POST /api/v1/search/find` (no session). `search()` calls `POST /api/v1/search/search` with optional `session_id`. `glob()` calls `POST /api/v1/search/glob`. `grep()` calls `POST /api/v1/search/grep` with all filter params (`case_insensitive`, `exclude_uri`, `level_limit`, `node_limit`). All methods use `SearchMapper` for response mapping.

**SessionMapper**:
Pure functions in `adapters/driven/openviking/mappers/session-mapper.ts`: `toSessionId(raw: OVCreateSessionResponse | OVCommitResponse)` extracts `session_id`; `toCommitResult(raw: OVCommitResponse)` maps to `{ sessionId, taskId?, archiveUri?, archived? }`; `toTaskStatus(raw: OVTaskResponse)` maps task status; `toSessionInfo(raw: OVSessionInfo)` maps full session info, extracting `memoriesExtracted` from `memories_extracted` Record (via `total` key or sum). Also exports `serializePart(part)` and `serializeParts(parts)`.
_Avoid_: session parser

**SessionStoreAdapter**:
A concrete adapter class in `adapters/driven/openviking/session-store.ts` (port `SessionStore` was deleted in ADR-021 — tools call this via `SessionClient`). All 10 methods implemented: `create()` → `POST /api/v1/sessions`; `sendMessage()` → `POST /api/v1/sessions/{id}/messages` with serialized `Part[]`; `sendMessages()` → batch endpoint; `commit()` → `POST /api/v1/sessions/{id}/commit` with `keep_recent_count`; `getTaskStatus()` → `GET /api/v1/tasks/{id}`; `listTasks()` → `GET /api/v1/tasks` with optional filters; `sessionUsed()` → `POST /api/v1/sessions/{id}/used`; `deleteSession()` → `DELETE /api/v1/sessions/{id}`; `getSession()` → `GET /api/v1/sessions/{id}`; `listSessions()` → `GET /api/v1/sessions`.

**RelationMapper**:
Pure functions in `adapters/driven/openviking/mappers/relation-mapper.ts`: `toLinkResult(raw, source, targets, reason?)` constructs a `LinkResult` from domain params; `toRelations(raw)` maps OV graph response (array or `{ relations: [...] }` shape) into domain `Relation[]`.

**Typed Mappers**:
All mappers now accept typed OV wire-format inputs (e.g. `OVFindResponse`, `OVSessionInfo`, `OVWriteResponse`) instead of `raw: unknown`. The `mapper-utils.ts` guard functions (`getRecord`, `safeString`, `safeNumber`, `safeOptionalString`, `toArray`) were removed — the transport layer guarantees non-null responses on success paths. Each mapper accesses fields directly on the typed object, with `?? undefined` for optional-to-optional conversions and explicit `typeof` guards only where TypeScript cannot reach runtime (e.g. `OVSessionInfo.memories_extracted` Record → number).
_Avoid_: guard functions, safe-utils

**GraphStoreAdapter**:
A concrete adapter class in `adapters/driven/openviking/graph-store.ts` (port `GraphStore` was deleted in ADR-021 — tools call this via `RelationClient`). `link()` calls `POST /api/v1/relations/link` with `from_uri`, `to_uris[]`, optional `reason`. `unlink()` calls `DELETE /api/v1/relations/link` with `from_uri`, `to_uri`. `graph()` calls `GET /api/v1/relations?uri=` and maps via `RelationMapper`.

**Config Cascade**:
Config resolution order: compiled defaults → env vars (`OV_*`) → `.pi/settings.json` → active Profile (merged in `init()`, not `loadConfig()`). Each source overrides the previous via shallow merge.
`.pi/settings.json` is read at the `"pi-openviking"` namespace key — only the sub-tree under that key enters the cascade. Pi-level keys (`extensions`, etc.) are ignored.

F7a: Profile merge happens in `init()` via `ProfileManager.resolve(activeProfile)` → `deepMerge(baseConfig, profileOverride)`. `loadConfig()` stays pure — does not create ProfileManager. Services receive merged config at construction; ProfileManager not injected until F7b.
_Avoid_: merge, resolution chain

**Profile**:
A named config preset. One is always active. Four built-in: `default`, `web-dev`, `docs`, `learning`. Carries `name` + `description` + `behavior: ProfileBehavior` (optional, added in F7a). Schema: `ProfileConfigSchema` with `behavior: ProfileBehaviorSchema.default({})`. Built-in profiles carry behavioral overrides (topN, scoreThreshold, searchMode, expandGraph, autoRecall). O `web-dev` profile tem `expandGraph: false` por padrão (contexto focado, sem expandir grafo). targetUri é definido por profile customizado via `.pi/settings.json`, não por placeholder.

**ProfileBehavior**:
6 optional behavioral fields that override `RecallConfig` when a profile is active. Fields are optional — profile só sobrescreve o que define. Canonical type in `domain/common/profile-config.ts` as `Partial<Pick<RecallConfig, 6 overridable fields>>`. Zod schema in `infrastructure/config.ts` (ProfileBehaviorSchema — consolidado em ADR-021):
- `targetUri` (string?): escopo de busca. undefined = global.
- `topN` (number?): max results. undefined = usa default RecallConfig.
- `scoreThreshold` (number 0-1?): relevância mínima.
- `searchMode` (`'find'|'search'`?): modo de busca OV.
- `expandGraph` (boolean?): expandir grafo (F8+).
- `autoRecall` (boolean?): override do toggle default.

Resolved at init via `ProfileManager.resolve()` returning `Partial<Pick<PiOVConfig, "recall">>`. `init()` deep-merges into `RecallConfig` before constructing services. Services receive merged config — no ProfileManager reference until F7b.

**ProfileManager** (stateful, `domain/profile/service/ProfileManager.ts`):
Manages the active profile. Constructor receives `profiles: Record<string, ProfileConfig>` (`ProfileConfig` interface from `domain/common/profile-config.ts`) and `activeProfile: string`. Methods:
- `getActive(): string` — returns current profile name.
- `resolve(name?): Partial<Pick<PiOVConfig, "recall">>` — returns behavioral fields for merge. Only populated fields override.
- `apply(name): void` — validates name exists, updates state (F7b+).
- `list()` — returns `{name, description}[]`.

Register as singleton in container at init. In F7a, used only at init time (`init()` calls `pm.resolve()` and merges before service construction). In F7b, injected into services for runtime `apply()` support. `activeProfile` lido da config file em F7a; comando `/ov-profile` é F7b.

**AutoDetect** (F7b):
Minimatch rules-based profile detection (implemented via regex-based glob matcher with globstar support). `detect(cwd, rules): string | null`. Rules from config: `{ "pattern": "**/web*/**", "profile": "web-dev" }`. Built-in rules: `**/web*/**` → web-dev, `**/doc*/**` → docs. Runs in `session_start` when `activeProfile = "auto"`.
_Avoid_: config profile, named preset

**Logger Interface**:
The `Logger` contract in `domain/ports/logger.ts` with methods `info`, `warn`, `error`, `debug`, `isEnabled`. Pure interface — zero external dependencies.
_Avoid_: log, console

**File Logger**:
JSON lines output via `appendFileSync`. Rotates by size (10MB) and age (7 days), keeps up to 5 gzipped historical files.
_Avoid_: file logging, persistent logger

**DI Container**:
Removed in ADR-021 (Flat Hexagon). Dependencies are created directly in `init()` (`infrastructure/lifecycle.ts`) via `new Class(...)` — no container, no token registry, no service locator. `init()` returns a plain object with all wired instances. Constructors receive only the concrete dependencies they need, never a container.
_Avoid_: container, ioc, service locator

**Lifecycle**:
The `init()` (async, creates logger + wires everything) and `shutdown()` (sync, resets state, zero I/O) entry points for the Foundation layer.
Single `init()` in `infrastructure/lifecycle.ts`. No container — creates services and adapters directly via `new Class(...)` and returns them in a plain object. Registrations: config, logger, adapter, knowledgeBase, fsStore, graphStore, sessionStore, resourceStore, skillStore, ovClient, profileManager, graphExpander (conditional), recallCurator, sessionService, recallService, sessionSync, repoContext. Scorers `[relevanceScorer, temporalScorer]` wired in F4. GraphExpander injected when `expandGraph` is enabled. Pipeline removed per ADR-021 — handlers call services directly.
_Avoid_: bootstrap lifecycle, module lifecycle

**OpenVikingClient** *(domain port + adapter — added in ADR-021 Flat Hexagon)*:
Single port interface that composes 6 sub-interfaces: `SearchClient`, `FsClient`, `SessionClient`, `RelationClient`, `ResourceClient`, `SkillClient`. Interface defined in `src/domain/client/open-viking-client.ts`. Adapter implementation in `src/adapters/driven/openviking/client/client-adapter.ts` delegates each sub-interface method to the corresponding `OVAdapter` port implementation (KnowledgeBase → SearchClient, FsStore → FsClient, SessionStore → SessionClient, GraphStore → RelationClient, ResourceStore → ResourceClient, SkillStore → SkillClient).

Created via `createOpenVikingClient(adapter)` helper. Tools receive the relevant sub-interface directly — not the full `OpenVikingClient`. Eliminates the 8 separate port pass-through services that existed before.
_Avoid_: big client, god object

**SessionSync** *(implemented — `domain/services/session-sync-service.ts`)*:
Binds `SessionManager` to lifecycle hooks. Wraps commit retry, skip-on-shutdown-commit flag, and auto-commit timer coordination. Depends on `SessionManager` + `OVAdapter` (circuit breaker state) + logger. Replaces inline lifecycle coordination previously in `register-lifecycle-hooks.ts`. Manages auto-commit interval timer and `dirtySinceLastCommit` flag as instance state.

The `skipShutdownCommit` flag is a **module-level `let`** in `register-lifecycle-hooks.ts` — set by `session_before_switch` hook on successful commit, consumed by `session_shutdown` to avoid double-commit, reset after consumption. SessionSync does NOT own this flag; it was deliberately kept as module state because it bridges two hooks that don't share an instance.
_Avoid_: session lifecycle manager

### Core Domain (future phases)

**KnowledgeItem**:
A unit of persistent knowledge stored in OpenViking. Can be a memory (extracted text with metadata) or a resource (document, file, reference). Has a Uri, content, and optional relations.

**Recall Toggle**:
A user-controlled toggle command (`/ov recall on|off`) that enables or disables auto-recall. Initial state from `RecallConfig.autoRecall` (default true). Command overrides runtime state — does not mutate config.
No intent detection — user decides when recall fires. searchMode comes from RecallConfig, overridable via profile.
_Avoid_: intent detector, auto-detect recall

**Recall Curator** *(implemented — `domain/recall/recall-curator.ts`)*:
Thin wrapper class over the pure `curate()` function. Constructor takes `RecallConfig`, `Scorer[]`, `Logger`. Single method `curate(results: SearchResult): CuratedResult` reads `topN`, `scoreThreshold`, `maxTokens` from config, builds `CurateOpts`, calls the pure `curate()`, emits log with item/token counts. `GraphExpander` optional — absent in F4, injected in F8. 6 tests.
**Scorers** (`domain/recall/curate.ts`) extend the internal scoring with relevance and temporal signals — they refine, not replace, the base sort. `relevanceScorer`: keyword overlap between query tokens and item text+uri, case-insensitive, max +0.5. `temporalScorer`: exponential decay on `CuratedItem.modTime`, half-life 7 days, max +0.5. Additional scorers (lexical, preference) in future slices.

**Graph Expander**:
Optionally traverses OV relations from seed KnowledgeItems to inject related resources into context.
Injected into RecallService as optional (`GraphExpander?`). Absent until F8 — no-op when undefined.



### Shared Types (shared kernel)

**Part**:
A discriminated union (`TextPart | ToolPart | ContextPart`) that represents a piece of content in an OV session message.
Maps to OV v3 `part` types. Lives in `domain/common/part.ts`.

**FindQuery**:
A data object with `query`, optional `limit`, `targetUri`. Used for simple search without session context.
Maps to OV `POST /api/v1/search/find`. Lives in `domain/common/search-query.ts`.

**SearchRequest**:
A data object with `query`, optional `limit`, `sessionId`, `targetUri`. Used for deep search
with server-side intent analysis. Maps to OV `POST /api/v1/search/search`.
Lives in `domain/common/search-query.ts`.

**SearchOptions**:
Optional config bag for advanced OV search params: `scoreThreshold`, `since`, `until`, `timeField`, `level`, `filter`, `includeProvenance`. Passed as optional `opts` parameter alongside `FindQuery`/`SearchRequest`. Not inlined into query types to keep them lean for common case. Lives in `domain/common/search-query.ts`.

**ContentLevel**:
A string literal union: `"abstract" | "overview" | "read"`. Controls response detail level for `FsStore.read()`.
Lives in `domain/common/content-level.ts`.

**WriteMode**:
A string literal union: `"replace" | "append" | "create"`. Controls overwrite behavior for `FsStore.write()`.
Lives in `domain/common/write-mode.ts`.

**ReindexMode**:
A string literal union: `"vectors_only" | "full"`. Controls reindex scope for `FsStoreAdapter.reindex()`. Default `"vectors_only"` rebuilds vector embeddings only; `"full"` rebuilds both scalar and vector indexes. Lives in `domain/client/ov-types.ts` as an exported type alias.



**Curate Pipeline**:
A pure function: `(SearchResult, CurateOpts) => CuratedResult`. No side effects, no TokenBudget mutation.
Token count returned but not deducted — caller (`RecallService`, F4) manages budget.
Accepts optional `Scorer[]` and `query` in `CurateOpts`. Each scorer is `(item: CuratedItem, query: string) => number`;
scores summed per item after base sort, then re-sorted. No scorers passed = backward-compatible behavior.
Built-in scorers: `relevanceScorer` (keyword overlap, max +0.5), `temporalScorer` (exponential decay, half-life 7d, max +0.5).
Scorers live in `domain/recall/curate.ts` alongside the pipeline.

**FsStore.write mode**:
Does NOT expose `wait` in the domain interface. Synchronous wait is an OV transport detail resolved
by the adapter with a default timeout. Domain operates on the concept of "write and be done".

**FsStore.delete with glob** (F8.4):
`/ov-delete` command accepts both literal URI and glob pattern (e.g. `viking://resources/temp/*`). Pattern resolution calls `KnowledgeBase.glob()` first, then deletes each match. Confirmation dialog shows matched count before proceeding.

**Lifecycle Hook Module**:
The extracted lifecycle hook registration and per-session handler in `adapters/driver/pi-lifecycle/register-lifecycle-hooks.ts`. Two exports:
- `registerLifecycleHooks(pi, svcs)` — registers `message_end`, `session_shutdown`, `before_agent_start` hooks. Called once per process.
- `handleSessionStart(ctx, svcs)` — runs on every `session_start`: auto-detect profile, widget attach/update, session creation.
Dependencies passed explicitly via `LifecycleServices` interface — no module-level `let` closure.

**Uri** (class — value object):
A `viking://` URI identifying a resource or location in the OpenViking filesystem. Used across all bounded contexts. Implemented as class with validation in constructor — not a type alias.
_Avoid_: path, string identifier

**SessionId** (class — value object):
An opaque identifier for an OpenViking session. Created by `SessionStore.create()`, consumed by recall and profile. Implemented as class — type safety vs Uri.
_Avoid_: session token, session key

**DomainError** (class):
Base class for all domain-layer errors. Subtyped as `NotFoundError`, `ConnectionError`, `ValidationError`, etc. Every domain operation that can fail produces a typed DomainError.
_Avoid_: generic Error, exception

### Services

**RecallService** *(implemented — `domain/recall/recall-service.ts`)*:
Orchestrator tying KnowledgeBase + RecallCurator into a single `recall(prompt)` call. Constructor takes `KnowledgeBase`, `RecallCurator`, `RecallConfig`, `Logger`, `enabled: boolean` (toggle state). Returns `RecallResult { items, tokens, formatted, total }`. 5 tests.

**Interface**: `recall(prompt: string, sessionId?: SessionId): Promise<RecallResult>` — F6 `before_agent_start` handler calls this passing `sessionService.getActive()` as sessionId. SessionId is forwarded to `kb.search()` when `searchMode === "search"` (OV uses session context for intent analysis). Not passed to `kb.find()` — find() doesn't accept sessionId.

**Flow**: (1) Check `enabled` toggle → if false, return empty without calling KB. (2) Route to `kb.find()` or `kb.search()` based on `config.searchMode`, passing `prompt`, `topN`, `targetUri`. (3) Pass raw results through `curator.curate()`. (4) Build `formatted` string from curated items. (5) Return `RecallResult`.

**Graceful degradation**: Catches `ConnectionError` from KB → logs warn ("OV unavailable, skipping recall") → returns empty result. Also catches `DOMException`/`AbortError`/`TimeoutError` as defense-in-depth for signal abort paths that bypass the transport error-conversion layer. All other errors (ValidationError, etc.) propagate — those indicate bugs, not transient failures.

**RecallConfig** (11 fields): `targetUri` (optional string, undefined=global), `topN` (number, default 8), `scoreThreshold` (number 0-1, default 0.5), `maxTokens` (int, default 4000), `expandGraph` (boolean, default true), `expandGraphDepth` (literal 1) — fixo em 1 (apenas vizinhos diretos). Se depth variável for necessária, estender GraphExpander., `expandGraphMaxRatio` (number 0-1, default 0.2), `expandGraphMinSeedScore` (number 0-1, default 0.4), `searchMode` (literal `'find'` | `'search'`, default `'search'`), `recallSearchTimeout` (number, default 60000), `autoRecall` (boolean, default true).
Canonical interface in `domain/common/recall-config.ts`. Zod schema in `infrastructure/config/schema.ts` as `RecallConfigSchema` — inferred type exported as `RecallConfigSchemaType`.
Env vars: `OV_TOP_N`, `OV_SCORE_THRESHOLD`, `OV_TARGET_URI`, `OV_EXPAND_GRAPH`, `OV_SEARCH_MODE`.
ProfileBehavior (6 fields) overrides RecallConfig via merge. Defined in `domain/common/profile-config.ts` as `Partial<Pick<RecallConfig, 6 overridable fields>>`.

**SessionManager** *(implemented — `domain/services/session-service.ts`)*:
Renamed from SessionService in ADR-021 (Flat Hexagon). Stateful service that manages the OV session lifecycle. Owns the active session — callers get the current session via `getActive()` rather than tracking it externally. Depends on `SessionClient` (sub-interface of `OpenVikingClient`) + `SessionManagerConfig { commitTimeout, pollInterval? }`.

Methods: `createAndSet(): Promise<SessionId>`, `getActive(): SessionId | null`, `sendMessage(sessionId, role, parts)`, `sendMessages(sessionId, messages)` (batch — delegates to `POST /api/v1/sessions/{id}/messages/batch`, max 100 per call), `commit(sessionId, options?): Promise<CommitResult>`, `waitForCommit(taskId, timeout?): Promise<TaskStatus>`, `deleteSession(sessionId)`, `getSession(sessionId)`, `sessionUsed(sessionId, contexts)`.

Active session is instance-level private state. `createAndSet()` creates via `SessionClient.createSession()` and stores as active; subsequent calls replace the previous active. `commit()` returns `{ taskId }` immediately — no polling. `waitForCommit()` polls `getTaskStatus()` at `pollInterval` (default 1s) until `completed`/`failed` or timeout. Throws on timeout.
Bindings: `pi.on('session_start')` → `createAndSet()`.
_Avoid_: session handler

**FsStoreService**:
Eliminated in ADR-021 (Flat Hexagon). Tools call the `FsStore` port directly via the `FsClient` sub-interface of `OpenVikingClient`. No pass-through service layer between tools and the `FsStore` adapter.
_Avoid_: fs handler, fs service

**SearchService**:
Eliminated in ADR-021 (Flat Hexagon). Tools call the `KnowledgeBase` port directly via the `SearchClient` sub-interface of `OpenVikingClient`. No pass-through service layer between tools and the `KnowledgeBase` adapter.

**F4 scope (revised)**: Domain logic only (scorers, ~~IntentDetector~~, RecallCurator) + RecallService + SessionManager + RecallConfig interface in domain/common/ + lifecycle wiring. IntentDetector eliminated — recall is a toggle command. Lifecycle wiring in `init()` creates and registers RecallCurator (with scorers), SessionManager (wired to SessionClient), RecallService (wired to KB + curator, enabled=true). SearchService and FsStoreService eliminated in ADR-021 — tools call ports directly.

### Tools (F5.1 — first vertical slice)

**ov_search** *(implemented — `adapters/driver/pi-tools/ov-search.ts`)*:
Pi tool registered via `pi.registerTool()`. TypeBox schema: `{ query: string, mode?: "auto"|"fast"|"deep", limit?: number, targetUri?: string, scoreThreshold?: number, since?: string, until?: string, timeField?: string, level?: number, includeProvenance?: boolean }`. Handler calls `searchClient.search()` or `searchClient.find()` directly via the `SearchClient` sub-interface of `OpenVikingClient`. Pipeline removed per ADR-021 — inline try/catch + logger only. Advanced params passed through as `SearchOptions` to OV API. Returns JSON-formatted `SearchResult`. Error message on failure. 10 unit tests + 2 integration tests.

**ov_glob** *(implemented — `adapters/driver/pi-tools/ov-glob.ts`)*:
Pi tool for URI pattern discovery. Schema: `{ pattern: string, uri?: string, limit?: number }`. Handler calls `searchClient.glob()` directly via `SearchClient`. Returns `GlobResult` as JSON. 2 unit tests + 1 integration test.

**ov_grep** *(implemented — `adapters/driver/pi-tools/ov-grep.ts`)*:
Pi tool for content regex search. Schema: `{ pattern: string, uri?: string, caseInsensitive?: boolean, levelLimit?: number, nodeLimit?: number }`. Handler calls `searchClient.grep()` directly via `SearchClient`. Returns `GrepResult` as JSON. 2 unit tests + 1 integration test.



**ov_write** *(implemented — `adapters/driver/pi-tools/ov-write.ts`)*:
Pi tool for content mutations. Single tool with `action` enum to minimize prompt surface area. TypeBox schema: `{ action: "save"|"mkdir"|"mv", uri: string, content?: string, targetUri?: string, mode?: "replace"|"append"|"create" }`. Handler calls `fsClient.save()`/`fsClient.mkdir()`/`fsClient.mv()` directly via `FsClient` (sub-interface of `OpenVikingClient`). Pipeline removed per ADR-021 — inline try/catch + logger only. Returns JSON result or error. 6 unit tests + 3 integration tests.

**ov_read** *(implemented — `adapters/driver/pi-tools/ov-read.ts`)*:
Pi tool for reading content at three depth levels. TypeBox schema: `{ uri: string, level?: "abstract"|"overview"|"read", offset?: number, limit?: number }`. Handler calls `fsClient.read()` directly via `FsClient`. Returns raw `body` string (not JSON) for direct consumption. 4 unit tests + 1 integration test.

**ov_recall** *(implemented — `adapters/driver/pi-tools/ov-recall.ts`)*:
Pi tool for explicit recall trigger. TypeBox schema: `{ prompt: string, limit?: number }`. Handler calls `recallService.recall(params.prompt)` directly — inline try/catch + logger, no pipeline. Returns `RecallResult.formatted` text (items with URI + content). On empty result, returns informative message. Errors caught and reported. 4 unit tests + 1 integration test.

**ov_list** *(implemented — `adapters/driver/pi-tools/ov-list.ts`)*:
Pi tool for flat directory listing. TypeBox schema: `{ uri: string, recursive?: boolean }`. Handler calls `fsClient.list()` directly via `FsClient`. Returns JSON array of `FsEntry` (uri, type, size?, modTime?). No formatting — raw data for agent programmatic use.

**ov_tree** *(implemented — `adapters/driver/pi-tools/ov-tree.ts`)*:
Pi tool for recursive tree listing. TypeBox schema: `{ uri: string }`. Handler calls `fsClient.tree()` directly via `FsClient`. Returns JSON array of `FsEntry` (uri, type). Raw data, no indentation — agent parses paths to infer hierarchy.

**ov_stat** *(implemented — `adapters/driver/pi-tools/ov-stat.ts`)*:
Pi tool for URI metadata. TypeBox schema: `{ uri: string }`. Handler calls `fsClient.stat()` directly via `FsClient`. Returns single `FsEntry` as JSON object (uri, type, size?, modTime?).

**ov_delete** *(implemented — `adapters/driver/pi-tools/ov-delete.ts`)*:
Pi tool for resource deletion. TypeBox schema: `{ uri: string, recursive?: boolean }`. Handler calls `fsClient.delete()` directly via `FsClient`. No confirmation — agent owns its tool calls. Returns success/error message. No glob support — agent composes with `ov_glob` for batch delete. Contrasts with `/ov-delete` command which shows `ctx.ui.confirm()`.
_Avoid_: ov_delete with glob, delete with confirmation

**ov_resource** *(implemented — `adapters/driver/pi-tools/ov-resource.ts`)*:
Pi tool for saving resources. Validates URI prefix `viking://resources/`, delegates to `fsClient.save()` via `FsClient`. TypeBox schema: `{ uri: string, content: string, mode?: "replace"|"append"|"create" }`. Returns JSON result. 6 unit tests. Thin alias of `ov_write` with prefix validation — does not use dedicated OV endpoint. Decline to consolidate into `ov_write` per grill decision: agent discoverability via search benefits from having a named resource tool.

**ResourceStore** *(port — deleted in ADR-021)*:
Was the domain port for importing external resources. Interface `importUrl(url, options?, signal?)` → `Promise<ResourceImportResult>`. Port file `domain/ports/resource-store.ts` was deleted. Types (`ResourceImportResult`, `ImportOptions`) live in `domain/client/ov-types.ts`. Adapter class `ResourceStoreAdapter` in `adapters/driven/openviking/resource-store.ts` is called via `ResourceClient` sub-interface of `OpenVikingClient`.

**ResourceStoreAdapter** *(driven adapter — `adapters/driven/openviking/resource-store.ts`)*:
Implements `ResourceStore` port. `importUrl()` calls `POST /api/v1/resources` with `{ path, to?, reason?, wait? }`. Response parsed via `toResourceImportResult()` in `mappers/resource-mapper.ts`. 11 unit tests.

**SkillStore** *(port — deleted in ADR-021)*:
Was the domain port for the OV skills API. Method `addSkill(data: string | SkillData, options?, signal?)`. Port file `domain/ports/skill-store.ts` was deleted. Types (`AddSkillResult`, `SkillData`, `AddSkillOptions`) live in `domain/client/ov-types.ts`. Adapter class `SkillStoreAdapter` in `adapters/driven/openviking/skill-store.ts` is called via `SkillClient` sub-interface of `OpenVikingClient`.

**SkillStoreAdapter** *(driven adapter — `adapters/driven/openviking/skill-store.ts`)*:
Implements `SkillStore` port. `addSkill()` sends `POST /api/v1/skills` with `{ data, wait?, timeout? }`. Response mapped via `toAddSkillResult()` in `mappers/skill-mapper.ts`.

**ov_session** *(implemented — `adapters/driver/pi-tools/ov-session.ts`)*:
Pi tool for querying OV session metadata. Uses `sessionManager.getSession()` to return message count, commit count, memories extracted. Accepts optional `sessionId` (defaults to active session). TypeBox schema: `{ sessionId?: string }`.

**ov_skill** *(implemented — `adapters/driver/pi-tools/ov-skill.ts`)*:
Pi tool for saving skills. Calls `SkillStore.addSkill()` directly (no service — pass-through eliminated). Accepts SKILL.md content or structured SkillData. TypeBox schema with optional `wait`, `name`, `description`, `allowedTools`, `tags`. Returns JSON with `rootUri`, `uri`, `name`. 6 unit tests.

**ov_import** *(implemented — `adapters/driver/pi-tools/ov-import.ts`)*:
Pi tool for importing external URLs as OV resources. Calls `ResourceStore.importUrl()` directly (no service — pass-through eliminated). TypeBox schema: `{ url: string, targetUri?: string, reason?: string, wait?: boolean }`. Returns JSON with `status`, `rootUri`, `sourcePath`. OV server-side parses Markdown, PDF, HTML, Word, images, and more. 6 unit tests.
_Avoid_: add_resource, import tool

**Tool factory pattern**: Each tool is a `create*Tool(client, ...)` function receiving the relevant `OpenVikingClient` sub-interface (e.g. `SearchClient`, `FsClient`, `SessionClient`). Pipeline removed per ADR-021 — tools use inline try/catch + logger. Most tools receive a sub-interface of `OpenVikingClient`; `ov_skill` and `ov_import` receive the port directly (`SkillStore`, `ResourceStore`) — their services were pass-through with no logic, eliminated per ADR-017 precedent.

### GraphExpander (F8.2)

**GraphExpander** (optional class):
Injected into `RecallCurator`. Expands recall results by traversing OV relations (`GET /api/v1/relations?uri=`). Reads each relation's abstract (`kb.read(uri, "abstract")`). Results marked `source: "graph"`, score = seed.score × 0.8. Merged into custom message `memory_context` under `[graph]` section.

**Config fields** (in `RecallConfigSchema`):
- `expandGraph` (boolean, default true) — enable expansion
- `expandGraphDepth` (literal 1) — **fixo em 1** (apenas vizinhos diretos). F8.2 implementa depth=1. Estender se profundidade variável for necessária.
- `expandGraphMaxRatio` (number 0-1, default 0.2) — max additional tokens as fraction of original budget
- `expandGraphMinSeedScore` (number 0-1, default 0.4) — only expand from seeds above this score

**Constraints:**
- Depth = 1 only (no BFS). Relations read in parallel via `Promise.all`.
- Relation already present as seed → skip (no duplicate).
- Budget guard: if insufficient tokens for all relations' abstracts, prioritize those with longer `reason` strings.

### Commands (F5.4 — slash commands)

**Command factory pattern**: Each command is a `create*Command(svc, ...)` function returning an options object compatible with `pi.registerCommand()`. The barrel export `command-registry.ts` provides `registerAllCommands(pi, services)` that registers all 9 commands in one call. Commands call services directly — no middleware (pipeline removed per ADR-021). All commands live in `adapters/driver/pi-commands/`. 34 unit tests total.

**`/ov-recall on|off`** *(implemented — `adapters/driver/pi-commands/ov-recall-command.ts`)*:
Toggles `RecallService.setEnabled()`. Validates arg is `on` or `off`, shows usage on invalid input. Provides argument completions (`on`, `off`). Notifies user of new state. 6 tests.

**`/ov-status`** *(implemented — `adapters/driver/pi-commands/ov-status-command.ts`)*:
Reads current state from `config.ov.endpoint`, `sessionManager.getActive()`, `recallService.isEnabled()`, `config.recall.targetUri`, and `config.recall.searchMode`. Formats and displays via `ctx.ui.notify()`. Shows `"(global)"` when no target URI set. Shows `"none"` when no active session. 2 tests.

**`/ov-tree [uri]`** *(implemented — `adapters/driver/pi-commands/ov-tree-command.ts`)*:
Calls `fsClient.tree(uriStr)` directly via `FsClient`. Defaults to `viking://` when no URI provided. Formats result as indented tree with 📁 (directory) and 📄 (file) icons. Shows `"(empty)"` for empty result. Validates URI, shows error on failure. 5 tests.

**`/ov-commit [--wait]`** *(implemented — `adapters/driver/pi-commands/ov-commit-command.ts`)*:
Calls `sessionManager.commit(activeSessionId)`. Shows warning if no active session. When `--wait` flag passed and `taskId` returned, calls `sessionManager.waitForCommit(taskId)` and shows task status (completed/failed). 5 tests.

**`/ov-search <query>`** *(implemented — `adapters/driver/pi-commands/ov-search-command.ts`)*:
Calls `searchClient.search()` or `searchClient.find()` directly via `SearchClient`. Formats results as readable lines with URI, score (3 decimal places), and abstract. Shows memories, resources, and skills sections. Shows `"No results found."` for empty results. Shows usage on empty query. 6 tests.

**`/ov-delete <uri>`** *(implemented — `adapters/driver/pi-commands/ov-delete-command.ts`)*:
Shows `ctx.ui.confirm()` confirmation dialog before calling `fsClient.delete(input)` via `FsClient`. Validates URI. Cancels gracefully on user rejection. Supports glob patterns via `searchClient.glob()`. Shows error on failure. 5 tests.

**`/ov-reindex <uri> [--mode vectors_only|full]`** *(implemented — `adapters/driver/pi-commands/ov-reindex-command.ts`)*:
Calls `fsClient.reindex(uriStr, mode)` via `FsClient`. Rebuilds vector embeddings for a URI (default `vectors_only`). Validates URI, shows error on failure. Provides argument completions for `--mode`. 5 tests.

### OVWidget (F5.5)

**OVWidget** *(implemented — `adapters/driver/ov-widget.ts`)*:
A class that renders an OV status widget via `ctx.ui.setWidget("ov", ...)`. Single-line format:
```
⚡ OV | 🧠 recall | 💬 session-1 | 📊 2it 142tk
```
- `conn`: ⚡ connected / 💤 disconnected
- `recall`: 🧠 on / 💤 off
- `session`: session ID
- `lastRecall`: stats string (`Nnit Ntk`) — atualizado pelo `context` hook em cada caminho (cache hit, no results, recall off/CB open)

The widget exposes `attach(ui)` (binds to a UI context and renders immediately), `update(field, value)` (changes state and re-renders), and `render()` (returns string[]). Commands that modify state (`/ov-recall`, `/ov-commit`) call `widget.update()` via a `widgetUpdater` callback passed through `CommandServices`. 5 unit tests.

**Guard pattern** in `index.ts`:
An `initialized` flag ensures `init()` runs once per process.

**On first `session_start`:**
- Guard runs `init()`, which creates all services and adapters directly (no DI container)
- Calls `registerAllTools()` and `registerAllCommands()`
- Creates the shared `OVWidget`
- Registers 5 F6 lifecycle hooks (`context`, `before_agent_start`, `message_end`, `turn_end`, `session_shutdown`, `session_start`)

**On every `session_start`** (including fork/resume/reload):
- Widget attached to current UI context
- Health check removed — circuit breaker detects failures via real requests
- OV session created via `SessionManager.createAndSet()`
- If OV is unavailable, widget shows `🔴 disconnected`, operation continues gracefully

**Tool barrel** (`adapters/driver/pi-tools/tool-registry.ts`): `registerAllTools(pi, services, logger)` registers all 14 tools with inline error handling — no Pipeline, no LoggingMiddleware (removed per ADR-021).

**F5 complete**: 14 tools (ov_search, ov_glob, ov_grep, ov_write, ov_read, ov_recall, ov_list, ov_tree, ov_stat, ov_delete, ov_resource, ov_skill, ov_import, ov_session) + 9 commands (ov-recall, ov-status, ov-tree, ov-commit, ov-search, ov-delete, ov-profile, ov-start, ov-reindex) + OVWidget. Status bar pending.

### F6 — Auto-Recall + Session Sync

**F6 hooks** (in `index.ts`, no `application/` layer):
7 Pi lifecycle hooks that wire the domain services to the agent lifecycle:

- **`context`** → `RecallService.recall(prompt, sessionManager.getActive())`. Injects as custom message `{ customType: "memory_context", display: false }` with `<relevant-memories>` XML block appended after the user message. Fires before each LLM call. Cache by query hash prevents redundant OV traffic on subsequent calls in same turn; cache hit also calls `widget.update("lastRecall", cached.stats)`. Circuit breaker OPEN or recall disabled → clears `lastRecall` via `widget.update("lastRecall", "")`. Cache invalidated on new user message. See ADR-019.
- **`session_before_switch`** → Commits active OV session before `/new` or `/resume`. Retries once on failure (500ms backoff). If retry also fails, prompts user via `ctx.ui.confirm()`. User cancel → returns `{ cancel: true }`. On success → sets module-level `skipShutdownCommit` flag so `session_shutdown` skips its own commit (no double-commit).
- **`session_shutdown`** → Checks `skipShutdownCommit` flag first. If set, skips commit and resets flag. Otherwise commits active session with retry (C3). Clears auto-commit timer + recall cache.
- **`message_end`** → `SessionManager.sendMessage(sessionId, role, parts)` via MessageMapper. Syncs `user` messages only (assistant goes via `turn_end`). Tool calls preserved structurally — not flattened to text.
- **`turn_end`** → Merges assistant parts with tool results via `buildTurnParts()`, sends full turn via `sendMessage()`.
- **`session_start`** → widget attach/update + session creation + re-hydration on resume/fork.
- **`before_agent_start`** → `RepoContext.getSystemPromptSnippet()`. Injects resource index into `systemPrompt` with TTL cache. No output when no repos indexed.

**MessageMapper** (`adapters/driver/pi-lifecycle/message-mapper.ts`):
Pure function `agentMessageToParts(msg: AgentMessage): Part[]`. Converts Pi `AgentMessage` to domain `Part[]`: assistant content blocks → TextPart (text) + ToolPart (toolCall, toolStatus="pending"); toolResult messages → ToolPart (toolOutput, toolStatus="success"|"error"); user text → TextPart. Role `"user"` | `"assistant"` | `"toolResult"` supported.

## Flagged ambiguities

- **"Profile"** is overloaded three ways: (1) **Profile** — a named config preset in the Foundation layer; (2) **OV cProfile** — the server's own profiling mode; (3) **Memory Profile** — extracted user preferences from session memory. Use **Config Profile** for the Foundation concept, **OV cProfile** for the server concept, and **Memory Profile** for extracted preferences.
- **"ProfileBehavior"** is a subset of Profile that overrides `RecallConfig`. Not to be confused with **Memory Profile** (OV's memory category) or **Profile** (the named config itself).
- **"Auto-Recall"** refers to the F6 `context` hook that calls `RecallService.recall()` automatically before each LLM call. Not to be confused with **RecallService** (the domain service class, born in F4) or **RecallCurator** (the curation wrapper).
- **"context" hook** in this codebase means the Pi `context` lifecycle event (fires before each LLM call). Not to be confused with **CONTEXT.md** (this glossary file). Prefer "lifecycle context hook" when ambiguity arises.
- **Uri** and **SessionId** live in a shared kernel (`domain/common/`), not inside any single bounded context. Every context imports from `common/`; no context imports from another context.
- **"Logger"** can refer either to the **Logger Interface** in `domain/ports/` or the **File Logger** implementation in `adapters/driven/`. Prefer the qualified name.
- **"Config"** without qualification refers to the plugin's configuration managed by the **Config Schema**. Not to be confused with Pi's own settings (`.pi/settings.json`) or OV's server configuration.
- **"application/"** layer is empty and will remain empty. Pass-through application services (SessionService, SearchService, FsStoreService) were eliminated in ADR-021 — tools call ports directly. Middleware pipeline was also eliminated — handlers use inline try/catch + logger. Lifecycle hooks live in `index.ts`. No F6 tasks create an `application/` directory.

## Phase 2 Complete (v0.3.x)

All Phase 2 items from PRD #80 are implemented:

| Item | Status | Tests |
|---|---|---|
| **session_before_switch hook** | ✅ Commit + retry + user confirm | 7 |
| **Resume re-hydrate** | ✅ sendMessages() + session history replay | 7 |
| **system/status adapter** | ✅ SystemStatusClient + /ov-status integrado | 4 |
| **ov_search advanced params** | ✅ 6 params (scoreThreshold, since, until, timeField, level, includeProvenance) | 10 |
| **Widget recall stats** | ✅ Cache hit stats, empty results, CB open/disabled | já existentes |
| **Peer ID cleanup** | ✅ Removido de SearchOptions, adapter testado | 2 adapter tests |
| **sessionUsed() hook test** | ✅ Coberto no lifecycle test | 1 |

### SystemStatusClient

Adaptador em `adapters/driven/openviking/system-status.ts` que chama `GET /api/v1/system/status` via Transport.
Método `getStatus(): Promise<SystemStatus>` → retorna `{ initialized: boolean, user?: string }`.
Nunca lança exceção — em caso de erro retorna `{ initialized: false }`.
Usado pelo comando `/ov-status` para mostrar status vivo do servidor OV ("live" ou "unavailable").

### Re-hydrate em resume/fork

Quando `session_start` é emitido com `reason: "resume"` ou `"fork"`, o handler lê as últimas 50 entradas de `ctx.sessionManager.getBranch()`, filtra `user`/`assistant`, mapeia via `agentMessageToParts()`, e envia em batch via `sessionManager.sendMessages()` (via `SessionSync`). Chunks de 50 em 50.

## Deferred (aguardando demanda)

| Item | Target | Trigger |
|---|---|---|
| **privacy-configs API** | Port + adapter + tool | Skills precisarem de secrets |
| **input hook** | Interceptar comandos direto do input | Usuários pedirem atalhos OV |
| **registerShortcut** | Atalhos de teclado | Demanda UX |
| **registerFlag** | `pi --ov-config` | Múltiplos profiles por projeto |
| **resources_discover hook** | Skills OV via descoberta automática | Integração skills Pi + OV |
| **model_select hook** | Ajustar maxTokens por modelo | Recall com modelos diferentes |
| **Integration tests Docker** | globalSetup + FS/search/session tests | docker-compose.test.yml já existe, falta test |
| **session_before_compact hook** | Commit OV antes de compactação Pi | Compaction não perde dados (message_end já sincronizou) |
| **system/wait endpoint** | Block até processing async terminar | Pipeline write→search sem polling |

## Example dialogue

> **Dev:** "How does Config Cascade work at startup?"
>
> **Domain expert:** "Bootstrap resolves config in order: compiled defaults → env vars like `OV_LOG_LEVEL` → `.pi/settings.json` → active Profile. Zod validates the final merged object. An invalid field like `level: "verbose"` throws at bootstrap time, not silently at runtime."
>
> **Dev:** "So if I add a new config field, I only touch the Config Schema?"
>
> **Domain expert:** "The Config Schema is the single source of truth. Update the Zod definition, and the `PiOVConfig` type updates automatically via `z.infer`. The validated config is used directly by `init()` to create services — no container indirection."
>
> **Dev:** "Can I swap the File Logger for a different implementation?"
>
> **Domain expert:** "Yes — that's the point of the Port interface. The domain code depends only on Logger Interface. As long as the new implementation satisfies that contract, pass it to `init()` and the rest of the system doesn't change."
>
> **Dev:** "Will Recall Service need to import anything from OV?"
>
> **Domain expert:** "No. Recall Service depends on Port interfaces — KnowledgeBase, Curator, GraphStore. The OV Adapter implements those ports behind the scenes. The domain layer has zero awareness of HTTP, authentication, or the OV API."
