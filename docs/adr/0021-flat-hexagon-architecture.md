# ADR-021: Flat Hexagon Architecture

**Status:** Accepted
**Date:** 2026-06-14
**Supersedes:** ADR-017 (collapse FS services), ADR-020 (keep pipeline abstraction)

## Context

After months of production use, the pi-openviking plugin had grown to 180 source files, 8 ports, 8 adapters, 6 mappers, 3 pass-through services, 5 config files, and a DI container with 17 singletons — all wrapping HTTP calls to a single backend (OpenViking).

An audit cycle (2026-06-10 through 2026-06-14) revealed:
- 4 of 5 domain services were pure delegation with no business logic
- Config cascade had 5 files for what amounts to defaults → env → file → profile merge
- DI container registered 17 singletons but no test used it — every test instantiated directly
- Middleware pipeline duplicated 14 times in tool-registry.ts for a single middleware (logging)
- All 8 ports spoke to the same backend (OV) — no swap scenario existed in the market

A market search confirmed no backend can replace OV today as a unified memory + filesystem + sessions + skills + graph backend.

## Decision

Adopt **Flat Hexagon** — keep hexagonal architecture (domain pure, ports/adapters) but aggressively flatten layers where abstraction has proven unnecessary.

### Changes

| # | Area | Decision | Replaces |
|---|------|----------|----------|
| 1 | **Ports** | 1 `OpenVikingClient` (composed of sub-interfaces `SearchClient`, `FsClient`, `SessionClient`, `RelationClient`, `ResourceClient`, `SkillClient`) + `Logger` | 8 separate ports |
| 2 | **Services** | Eliminate `SearchService`, `FsStoreService`. Keep `RecallService` (real logic), `SessionManager` (renamed from SessionService) | 2 files eliminated |
| 3 | **Pipeline** | Eliminate. Inline try/catch + logger in each tool handler | `Pipeline<T>`, `loggingMiddleware()` |
| 4 | **Config** | 1-2 files. Keep Zod. Eliminate `Cascade` class, `Loader` class, separate logger-schema, profile-schema | 5 files → 1-2 |
| 5 | **DI Container** | Eliminate. Direct instantiation in `init()` | `container.ts`, 17 register() calls |
| 6 | **Mappers** | Keep separate (testability, OV format changes isolated) | — |
| 7 | **Circuit Breaker** | Keep reducer pattern (decision from 2026-06-06) | — |
| 8 | **Message sync** | Keep synchronous `await` in `message_end` (sendMessage is ~10-15ms, imperceptible) | — |
| 9 | **RecallService** | Keep unchanged (toggle, cooldown, timeout, format logic) | — |

### What stays unchanged

- `RecallService`, `RecallCurator`, `curate.ts`, scorers — real domain logic
- `SessionManager` — renamed, active session state + commit + polling
- `DomainError` hierarchy — graceful degradation
- `Uri` / `SessionId` value objects — type safety
- `OVWidget` — user feedback
- `message-mapper.ts` — complex Pi-to-OV translation
- `FileLogger` — works
- Auto-recall cache (query hash, ADR-019)
- Circuit breaker reducer pattern + lazy TICK (ADR-decided 2026-06-06)

## Consequences

### Positive

- **53% fewer source files** (~180 → ~85)
- **57% less code** (~5,829 → ~2,500 LOC)
- **Zero indirection loss** — every deleted layer was pure delegation
- **Faster test suite** (fewer files, less setup)
- **Easier onboarding** — new dev sees `client.find()`, not `container.resolve("searchService").search()`

### Negative

- **Less theoretical swap-readiness** — merging ports assumes OV stays the backend
- **Pipeline would need re-creation** if a 2nd middleware (cache, audit) materializes
- **Config Zod validation lost** on eliminated schema files (consolidated into 1 file)

### Neutral

- ADR-017 (collapse FS services) and ADR-020 (keep pipeline) are superseded — their reasoning is absorbed into this broader flattening
- The 2026-06-10/11 refactoring (null safety, pollCommit retry, error normalization) remains in place and unchanged

## Trade-off Analysis

### Ports: 1 vs 8

A market search of 12 alternative memory backends (Mem0, Zep/Graphiti, Letta, OMEGA, Cognee, Hindsight, and 6 others) found **no single product that replaces OV as a unified backend**. Every alternative covers a subset of OV's features (vector search, or graph, or sessions). Replacing OV would require composing 3-4 systems (Qdrant + Neo4j + S3 + custom session logic). The hypothetical swap scenario driving the 8-port architecture does not exist.

### Services: Elimination pattern

The grill confirmed that `SearchService` and `FsStoreService` are pure delegation. This follows the pattern established by ADR-017 (which eliminated ReadService/WriteService/FsService) and the 2026-06-10 memory (which eliminated SkillService/ResourceService as "pass-through with no logic"). Each elimination proved irreversible — no service was ever re-introduced.

### Pipeline: Cost vs benefit

At 14 instances of `new Pipeline<T>().use(loggingMiddleware(label, logger))`, the pipeline abstraction cost ~200 lines across 4 files (including tests) for a single middleware that logs handler duration. The `context` hook cache (ADR-019) was implemented outside the pipeline — proving the extensibility argument was hypothetical. The pipeline can be re-created in 21 lines if a 2nd middleware ever materializes.

## Migration Strategy

Three sequential PRs, each preserving all 776 tests green from first to last commit:

1. **PR 1: Merge adapters** — Create `OpenVikingClient` interface + adapter. Keep old ports as delegates. Add adapter factory.
2. **PR 2: Flatten tools + commands** — Replace service calls with `client.*()` calls. Eliminate `SearchService`, `FsStoreService`. Remove pipeline from tool-registry.
3. **PR 3: Simplify infra** — Consolidate config to 1-2 files. Replace DI container with direct instantiation. Remove `lifecycle.ts` DI wiring.

### Blocker / Dependency

None. The 3 PRs are additive — each can be merged independently. No other active work depends on this refactoring.
