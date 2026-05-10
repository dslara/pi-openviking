# Ubiquitous Language

## Systems & Actors

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Pi** | The coding agent harness that owns session history, prompt orchestration, and tool execution | pi-coding-agent, harness |
| **OpenViking** | The long-term memory server providing semantic search, resource storage, and memory extraction | OV, the server |
| **Agent** | The LLM instance orchestrated by Pi that uses tools and produces responses | model, LLM |
| **Extension** | A Pi plugin that registers tools and hooks into session lifecycle events | plugin, add-on |

## Session Lifecycle

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Pi Session** | A single conversation thread managed by Pi, containing messages and branch history | conversation, chat |
| **OV Session** | A mirrored conversation stream stored in OpenViking for memory extraction | openviking session, target session |
| **Session Sync** | The incremental one-to-one mapping that streams Pi messages into an OV session | sync, mirroring |
| **Message** | A single turn in a Pi Session (user or assistant) | entry, turn |
| **Commit** | The act of flushing a Pi Session to OpenViking to trigger background memory extraction; produces a **Task ID**, **Archive URI**, and **Trace ID** | save, persist |
| **Flush** | Draining the queued message stream to ensure all pending messages reach OpenViking | sync, drain |
| **Branch** | The linearised history of a Pi Session, including custom entries like ov-session mappings | history, timeline |
| **Archive URI** | The `viking://` address where a committed session is archived after extraction | archive, backup URI |
| **Trace ID** | The tracking identifier returned with a **Commit** for observability | trace, request id |

## Memory & Knowledge

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Memory** | Long-term knowledge extracted from committed sessions (profiles, preferences, entities, patterns) | note, record |
| **Resource** | External knowledge (documentation, code, URLs) stored under `viking://resources/` | doc, file |
| **Skill** | A structured agent capability stored under `viking://agent/skills/` | capability, prompt template |
| **Auto-Recall** | The pre-turn injection of relevant memories into the agent's system prompt | recall, context injection |
| **Relevant Memories Block** | The XML `<relevant-memories>` fragment injected into the system prompt by **Auto-Recall** | memory block, context block |
| **Search Mode** | The depth of a `memsearch` query: **fast** (semantic only) or **deep** (context-aware with session) | mode, strategy |
| **Search Mode Resolver** | The logic that chooses fast vs deep based on session presence and query complexity | resolver, selector |
| **Recall Curator** | The multi-factor ranking and dedup pipeline that turns raw search results into the **Relevant Memories Block** | curator, ranker |
| **Composite Score** | The final relevance score after applying leaf, temporal, preference, and lexical boosts | adjusted score, final score |

## Content & Addressing

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **URI** | A `viking://` address identifying a memory, resource, skill, or filesystem entry | path, url, id |
| **Content Level** | The detail tier when reading a URI: **abstract** (summary), **overview** (children), or **read** (full text) | depth, detail |
| **Task ID** | The asynchronous identifier returned by a **Commit** operation | job id, operation id |

## Commands

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Pi Slash Command** | A user-invoked command registered with Pi (e.g. `/ov-search`, `/ov-commit`) | command, CLI command |
| **ov-search** | Command to search OpenViking memories and resources interactively | search command |
| **ov-ls** | Command to browse the OpenViking filesystem interactively | browse command |
| **ov-import** | Command to import a URL or local file into OpenViking | import command |
| **ov-delete** | Command to delete a resource by URI from OpenViking | delete command |
| **ov-recall** | Command to toggle **Auto-Recall** on or off for the current session | recall toggle |
| **ov-commit** | Command to manually **Commit** the current session to OpenViking | commit command |

## Infrastructure

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Transport** | The low-level HTTP module that communicates with OpenViking's REST API | http client, fetch layer |
| **Client Adapter** | The domain-facing module that maps operations (search, read, commit) to transport calls | client, api client |
| **Tool Definition** | The reusable factory that registers OpenViking tools with Pi, handling metadata and error wrapping | tool factory, registrar |
| **Bootstrap** | One-time extension setup that loads config, creates adapters, registers tools, and wires hooks | init, startup |
| **Logger** | Structured debug/error logging module writing to `~/.pi/agent/pi-openviking.log` | log, console |
| **Notify** | Deduplicated UI notification helper for surfacing errors without spamming the user | notification, alert |
| **Source Resolver** | The logic that determines whether an import source is a URL, local file, or directory | resolver, parser |
| **Temp Upload** | Transient binary staging endpoint used for directory zip uploads before final import | temp file, staging upload |
| **Post-Delete Verification** | Best-effort search confirmation after `memdelete` to warn if a resource still appears in the index | verification check |

## Relationships

- A **Pi Session** maps to exactly zero or one **OV Session** via **Session Sync**
- An **OV Session** contains many **Messages**
- A **Commit** operates on an **OV Session** and produces a **Task ID**, **Archive URI**, and **Trace ID**
- **Auto-Recall** uses **Search Mode** to find **Memories** and **Resources** relevant to the current **Message**
- The **Recall Curator** ranks results by **Composite Score** and assembles the **Relevant Memories Block**
- A **Resource** lives at a **URI** under `viking://resources/`
- A **Skill** lives at a **URI** under `viking://agent/skills/`
- **Memories** are extracted from committed **OV Sessions** by OpenViking background processes
- **Pi Slash Commands** invoke the same operations as tools but through Pi's chat UI

## Example dialogue

> **Dev:** "When a user sends a new **Message**, does the **Session Sync** immediately create an **OV Session**?"
>
> **Domain expert:** "No — the **OV Session** is created lazily on the first **Message** that needs to go to OpenViking. The **Session Sync** queues it up and **Flushes** asynchronously."
>
> **Dev:** "So if the OpenViking server is down, the **Pi Session** keeps working?"
>
> **Domain expert:** "Exactly. The **Transport** failures are swallowed silently. The **Pi Session** is the source of truth; the **OV Session** is just a mirror for **Memory** extraction."
>
> **Dev:** "When should the agent call **Commit**?"
>
> **Domain expert:** "Only when the user explicitly asks to save, or uses the `/ov-commit` **Pi Slash Command**. **Commit** triggers the background extraction that produces **Memories** — it's not automatic per turn."
>
> **Dev:** "What does the agent actually see from **Auto-Recall**?"
>
> **Domain expert:** "A **Relevant Memories Block** — an XML fragment injected into the system prompt before the agent turn. The **Recall Curator** builds it by ranking results with a **Composite Score** and trimming to a token budget."
>
> **Dev:** "If I import a local directory, how does it get into OpenViking?"
>
> **Domain expert:** "The **Source Resolver** detects it's a directory, zips it, and sends it via **Temp Upload**. Then it calls the regular import endpoint with the temp file ID."

## Flagged ambiguities

- **"Session"** is overloaded: it can mean either a **Pi Session** (the conversation thread) or an **OV Session** (the mirrored stream in OpenViking). Always qualify with **Pi** or **OV**.
- **"Commit"** in this domain means flushing a session to OpenViking for memory extraction, not a Git commit. Use **Commit to OV** or simply **Commit** when the context is clear.
- **"Message"** without qualification refers to a Pi message turn. OV messages are internal streaming artifacts — avoid exposing them in user-facing language.
- **"Tool"** in this codebase always means a Pi tool registered via **Tool Definition**. OpenViking has its own API endpoints, not tools.
- **"Command"** can mean either a **Pi Slash Command** (chat UI) or a shell command. Prefer **Pi Slash Command** for the UI constructs.
