> **Superseded by ADR-021 (2026-06-14).** Pipeline was removed — each tool handler now has inline try/catch + logger. See ADR-021 for rationale.

# ADR-020: Keep Pipeline abstraction despite single middleware

After architectural review, we considered flattening Pipeline<T> (tool-registry.ts ×14 pattern of `new Pipeline().use(loggingMiddleware)` → inline try/catch + logger.info/error in each tool handler). We chose to keep it.

**Why keep:** Pipeline is the correct seam for tool-handler-level cross-cutting concerns (logging, metrics, audit trail). Every other cross-cutting concern lives at Transport (circuit breaker, retry, error mapping) or `context` hook (caching) — different layers, not alternatives. The abstraction cost is low (~140 lines, 4 files including tests) and the handler remains pure business logic. Flattening would be easy to reverse later if a 2nd middleware never materializes.
