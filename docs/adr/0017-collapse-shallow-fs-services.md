> **Partially superseded by ADR-021 (2026-06-14).** The consolidation direction (remove pass-through services) was extended to also eliminate SearchService + FsStoreService + Pipeline.

# Collapse 3 shallow FsStore-based services into FsStoreService

ReadService (11 prod lines), WriteService (19 lines), and FsService (26 lines) were each pure delegators wrapping `new Uri()` + one port call on the same `FsStore` port. Merged them into a single `FsStoreService` class with all 9 methods. `ResourceService` kept separate — it depends on `ResourceStore`, a different port.

**Option A** (merge all 4 including ResourceService) rejected: `ResourceStore` is a different port with a different contract (URL import vs filesystem navigation). Merging would force `ov_import` to depend on a service exposing `delete()`/`reindex()` — violates ISP.

**Option C** (extract `toUri()` helper, keep 4 services) rejected: moves the wrapping to 13 tool handlers instead of eliminating the duplication.

Net effect: 3 DI registrations → 1, `ToolServices` interface shrinks 6→4 fields, -44 prod lines, -107 test lines.
