# pi-openviking

Pi extension for [OpenViking](https://github.com/openviking) — long-term memory and context database for AI coding agents.

> **Status:** Production-ready. Active development.
> **Architecture:** [Flat Hexagon](docs/adr/0021-flat-hexagon-architecture.md) — single `OpenVikingClient` port with 6 sub-interfaces, no DI container, no middleware pipeline.

## What it does

Pi is stateless between sessions. pi-openviking gives it persistent memory:

- **Auto-recall** — before each agent turn, relevant OV memories are injected into the prompt automatically.
- **Session sync** — messages are forwarded to an OV session in real time. On session shutdown, OV extracts memories (preferences, patterns, decisions).
- **Knowledge store** — save documentation, code, and notes into a `viking://` virtual filesystem.
- **Semantic search** — find memories and resources by meaning.
- **Profiles** — switch between `web-dev`, `docs`, `learning` to tune recall behavior.

## Tools (agent-facing)

| Tool | Action |
|------|--------|
| `ov_search` | Semantic search across memories, resources, skills. Modes: `fast`, `deep`, `auto`. |
| `ov_glob` | Discover URIs by glob pattern (e.g. `viking://**/*.md`). |
| `ov_grep` | Regex content search across stored knowledge. |
| `ov_read` | Read content at a `viking://` URI. Levels: L0 abstract, L1 overview, L2 full. |
| `ov_write` | Save, mkdir, or mv resources in the `viking://` filesystem. |
| `ov_recall` | Explicit recall — inject curated memories into the prompt on demand. |
| `ov_list` | Flat directory listing of `viking://` URIs. |
| `ov_tree` | Recursive tree listing of `viking://` URIs. |
| `ov_stat` | Get metadata (type, size, modTime) for a `viking://` URI. |
| `ov_delete` | Delete a resource at a `viking://` URI (no confirmation). |
| `ov_resource` | Save a resource document (`viking://resources/...`). |
| `ov_skill` | Save a skill definition (`viking://skills/...`). |
| `ov_import` | Import an external URL as an OV resource (HTML, PDF, Markdown, etc.). |
| `ov_session` | Query OV session metadata (message count, commit count, memories). |

## Commands (user-facing)

| Command | Action |
|---------|--------|
| `/ov-start` | Create a new OV session. |
| `/ov-profile {show\|list\|apply <name>\|detect}` | Manage behavioral profiles. |
| `/ov-reindex <uri> [--mode vectors_only\|full]` | Rebuild vector embeddings for a URI. |
| `/ov-commit [--wait]` | Commit session to OV (triggers memory extraction). `--wait` polls until done. |
| `/ov-search <query>` | Semantic search, human-readable. |
| `/ov-tree [uri]` | Browse `viking://` filesystem as a tree. |
| `/ov-delete <uri>` | Delete a `viking://` entry. |
| `/ov-recall <on\|off>` | Toggle auto-recall. |
| `/ov-status` | Show connection, session, recall toggle, profile, scope. |

## Auto-recall

Before each LLM call (via the `context` lifecycle hook), the plugin runs a guard chain:

1. **Toggle** — if auto-recall is off (`/ov-recall off`), skip.
2. **Circuit breaker** — if OV is unreachable, skip.
3. **Session** — auto-create a session if none exists.
4. **Recall** — search OV → curate → expand via GraphExpander → inject as hidden `<relevant-memories>` block.

## Profiles

4 built-in profiles tune recall behavior:

| Profile | topN | Threshold | Use case |
|---------|------|-----------|----------|
| `default` | 3 | 0.5 | General purpose |
| `web-dev` | 3 | 0.5 | Focused project context (no graph expansion) |
| `docs` | 5 | 0.3 | Broad documentation search |
| `learning` | 8 | 0.2 | Maximum capture |

Switch via `/ov-profile apply <name>`. Custom profiles can be defined in `.pi/settings.json` under `profile.profiles`. When `activeProfile = "auto"`, the plugin detects the profile from your workspace path.

## Configuration

Config cascade: `Defaults → Env vars (OV_*) → .pi/settings.json → Active Profile`

### `.pi/settings.json`

```json
{
  "pi-openviking": {
    "ov": {
      "endpoint": "http://localhost:1933",
      "apiKey": "dev",
      "account": "default",
      "user": "default",
      "timeout": 30000,
      "commitTimeout": 120000
    },
    "recall": {
      "topN": 8,
      "scoreThreshold": 0.5,
      "maxTokens": 4000,
      "expandGraph": true,
      "autoRecall": true
    },
    "profile": {
      "activeProfile": "default",
      "autoDetectRules": {}
    }
  }
}
```

### Key env vars

| Env | Config path | Default | Description |
|-----|-------------|---------|-------------|
| `OV_API_KEY` | `ov.apiKey` | `""` | API key |
| `OV_TOP_N` | `recall.topN` | `8` | Max recall items |
| `OV_SCORE_THRESHOLD` | `recall.scoreThreshold` | `0.5` | Min relevance score |
| `OV_TARGET_URI` | `recall.targetUri` | — | Scope recall to a URI subtree |
| `OV_EXPAND_GRAPH` | `recall.expandGraph` | `true` | Enable GraphExpander |
| `OV_SEARCH_MODE` | `recall.searchMode` | `"search"` | `"find"` or `"search"` |
| `OV_ACTIVE_PROFILE` | `profile.activeProfile` | `"default"` | Active profile |
| `OV_LOG_LEVEL` | `logger.level` | `"info"` | Log level |

## Running OpenViking (Docker)

### Prerequisites

Docker Engine + Docker Model Runner plugin. Pull models:

```bash
docker model pull ai/nomic-embed-text-v1.5
docker model pull ai/gemma4
docker model run ai/nomic-embed-text-v1.5 -d
docker model run ai/gemma4 -d
```

### Start

```bash
docker compose up
```

OpenViking starts on `http://localhost:1933`.

### Verify

```bash
curl http://localhost:1933/api/v1/sessions
# → JSON response (or 401 if auth required — server is up)
```

> Note: `/ready` is known to return 503 during initial startup — use `/api/v1/sessions` as a more reliable health indicator.

### Stop

```bash
docker compose down
```

Data persists in `~/.openviking/data` across restarts.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Auto-recall not working | `/ov-recall` is on? Server healthy? Logs at `~/.pi/agent/pi-openviking.log` |
| Requests rejected | Circuit breaker OPEN — wait 30s for auto-recovery or restart OV |
| Commit does nothing | Fire-and-forget by design. Use `/ov-commit --wait` to poll |
| Server unreachable | `curl http://localhost:1933/api/v1/sessions` |

## Related docs

| Doc | Contents |
|-----|----------|
| [`CONTEXT.md`](./CONTEXT.md) | Domain glossary and architecture decisions |
| [`UBIQUITOUS_LANGUAGE.md`](./UBIQUITOUS_LANGUAGE.md) | Expanded domain glossary |
| [`docs/adr/`](./docs/adr/) | Architecture Decision Records |
| [`LICENSE`](./LICENSE) | License |
