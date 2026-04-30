# pi-openviking

Pi extension for OpenViking context integration.

## Local Development Server (Docker)

### Prerequisites

1. **Docker Engine** + **Docker Model Runner** CLI plugin
2. Pull the models:

```bash
docker model pull ai/nomic-embed-text-v1.5
docker model pull ai/gemma4
```

3. Verify Model Runner is running:

```bash
docker model status
```

4. Load models in the background:

```bash
docker model run ai/nomic-embed-text-v1.5 -d
docker model run ai/gemma4 -d
```

### Start OpenViking

```bash
docker compose up
```

OpenViking starts on `http://localhost:1933`.

### Verifye 

```bash
curl http://localhost:1933/health
# → 200 OK

curl -X POST http://localhost:1933/api/v1/sessions
# → { "status": "ok", "result": { "session_id": "..." } }
```

### Stop

```bash
docker compose down
```

Data persists in `~/.openviking/data` on the host and survives `down`/`up` cycles.

### Architecture

```
host
├── Docker Model Runner (port 12434, OpenAI-compatible API)
│   ├── ai/nomic-embed-text-v1.5 (embedding, 768d)
│   └── ai/gemma4 (VLM)
│
└── docker-compose (network_mode: host)
    └── openviking (ports 1933 + 8020)
        consumes Model Runner via http://localhost:12434/v1
        config: ~/.openviking/ov.conf → /app/ov.conf
        data:   ~/.openviking/data   → /app/data
```
