# OV Doc URLs Reference

All URLs use `main` branch. When importing for a specific release, replace `main` with the tag (e.g. `v0.4.17.1`).

## README

| File | URL |
|------|-----|
| README.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/README.md` |

## Concepts (15 docs)

| # | Path | URL |
|---|------|-----|
| 1 | concepts/01-architecture.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/01-architecture.md` |
| 2 | concepts/02-context-types.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/02-context-types.md` |
| 3 | concepts/03-context-layers.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/03-context-layers.md` |
| 4 | concepts/04-viking-uri.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/04-viking-uri.md` |
| 5 | concepts/05-storage.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/05-storage.md` |
| 6 | concepts/06-extraction.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/06-extraction.md` |
| 7 | concepts/07-retrieval.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/07-retrieval.md` |
| 8 | concepts/08-session.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/08-session.md` |
| 9 | concepts/09-transaction.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/09-transaction.md` |
| 10 | concepts/10-encryption.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/10-encryption.md` |
| 11 | concepts/11-multi-tenant.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/11-multi-tenant.md` |
| 12 | concepts/12-metrics.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/12-metrics.md` |
| 13 | concepts/13-privacy.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/13-privacy.md` |
| 14 | concepts/14-multi-write-storage.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/14-multi-write-storage.md` |
| 15 | concepts/15-vikingbot.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/concepts/15-vikingbot.md` |

## API Reference (22 docs)

| # | Path | URL |
|---|------|-----|
| 1 | api/01-overview.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/01-overview.md` |
| 2 | api/02-resources.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/02-resources.md` |
| 3 | api/03-filesystem.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/03-filesystem.md` |
| 4 | api/04-skills.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/04-skills.md` |
| 5 | api/05-sessions.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/05-sessions.md` |
| 6 | api/06-retrieval.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/06-retrieval.md` |
| 7 | api/07-system.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/07-system.md` |
| 8 | api/08-admin.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/08-admin.md` |
| 9 | api/09-metrics.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/09-metrics.md` |
| 10 | api/10-privacy.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/10-privacy.md` |
| 11 | api/11-snapshot.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/11-snapshot.md` |
| 12 | api/12-content.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/12-content.md` |
| 13 | api/14-ovpack.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/14-ovpack.md` |
| 14 | api/15-watches.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/15-watches.md` |
| 15 | api/16-memory.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/16-memory.md` |
| 16 | api/17-tasks.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/17-tasks.md` |
| 17 | api/18-observer.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/18-observer.md` |
| 18 | api/19-agent-evolution.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/19-agent-evolution.md` |
| 19 | api/20-webdav.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/20-webdav.md` |
| 20 | api/22-openviking-assets.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/22-openviking-assets.md` |
| 21 | api/24-vikingbot.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/24-vikingbot.md` |
| 22 | api/99-api-doc-writing-guide.md | `https://raw.githubusercontent.com/volcengine/OpenViking/main/docs/en/api/99-api-doc-writing-guide.md` |

## Target URIs in OV

All docs go under:

```
viking://resources/pi-openviking/docs-ov/{path}
```

Example: `concepts/08-session.md` → `viking://resources/pi-openviking/docs-ov/concepts/08-session.md`

## Import Command Template

⚠️ Use `ov_write`, not `ov_import`. OV's ResourceStore (`ov_import`) parses markdown headings
into directory trees — files become directories. `ov_write` (FsStore) writes raw content as flat files.

```python
import json, subprocess

AUTH = [
    "-H", "X-API-Key: dev",
    "-H", "X-OpenViking-Account: default",
    "-H", "X-OpenViking-User: default",
    "-H", "X-OpenViking-Agent: pi",
]

def import_doc(gh_rel_path, ov_rel_path, doc_source, mode="create"):
    """Fetch raw markdown from GitHub and write to OV as flat file."""
    gh_url = f"https://raw.githubusercontent.com/volcengine/OpenViking/{doc_source}/{gh_rel_path}"
    ov_uri = f"viking://resources/pi-openviking/docs-ov/{ov_rel_path}"

    subprocess.run(["curl", "-s", "-o", "/tmp/doc.md", gh_url])
    content = open("/tmp/doc.md").read()
    if len(content) < 50:
        print(f"SKIP {ov_rel_path} — empty/small ({len(content)}b)")
        return False

    body = json.dumps({"uri": ov_uri, "content": content, "mode": mode})
    r = subprocess.run(
        ["curl", "-s", "-o", "/tmp/ov-res.json", "-w", "%{http_code}",
         "http://localhost:1933/api/v1/content/write",
         "-H", "Content-Type: application/json"] + AUTH + ["-d", body],
        capture_output=True, text=True,
    )
    code = r.stdout.strip()
    if code != "200":
        print(f"FAIL {ov_rel_path} (HTTP {code})")
        return False

    res = json.load(open("/tmp/ov-res.json"))
    status = res.get("status", "")
    if status == "ok":
        print(f"OK   {ov_rel_path} ({len(content)}b)")
        return True

    err = res.get("error", {}).get("code", "")
    # If ALREADY_EXISTS with mode=create, retry with mode=replace
    if err == "ALREADY_EXISTS" and mode == "create":
        return import_doc(gh_rel_path, ov_rel_path, doc_source, mode="replace")

    print(f"FAIL {ov_rel_path}: {err} — {res.get('error', {}).get('message', '?')}")
    return False
```

Usage: `import_doc("docs/en/concepts/08-session.md", "concepts/08-session.md", "main")`

Where `doc_source` is the branch/tag (e.g. `main` or `v0.3.24`).
The function auto-retries with `mode="replace"` if file already exists.
