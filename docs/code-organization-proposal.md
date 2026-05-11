# Proposta: Organização do Código por Feature

## Contexto

Atualmente `src/` contém ~20 arquivos flat. Conforme o projeto cresce, essa estrutura dificulta:
- Encontrar onde uma funcionalidade vive
- Identificar dependências circulares
- Onboard de novos devs
- Extração de módulos para reutilização

## Domínios Identificados

A partir do `UBIQUITOUS_LANGUAGE.md` e da análise do código, identificamos 6 features bem delimitadas:

| Feature | Arquivos Atuais | Responsabilidade |
|---------|-----------------|------------------|
| **ov-client** | `client.ts`, `transport.ts` | Comunicação HTTP com OpenViking |
| **session-sync** | `session.ts` | Espelhamento Pi Session → OV Session |
| **auto-recall** | `auto-recall.ts`, `recall-curator.ts`, `search-mode.ts` | Injeção de contexto relevante no system prompt |
| **tools** | `tools.ts`, `tool-def.ts` | Registro das 6 ferramentas Pi (memsearch, memread, etc.) |
| **commands** | `commands.ts`, `parse-args.ts`, `format-search.ts`, `format-browse.ts` | Slash commands e formatação de saída |
| **importer** | `source-resolver.ts`, `uploader.ts` | Import de URLs, arquivos e diretórios para OV |
| **shared** | `config.ts`, `logger.ts`, `notify.ts` | Infraestrutura cross-cutting |

---

## Opção A: Feature-Based (Recomendada)

```
src/
├── index.ts                    # Entry point + lifecycle hooks
├── bootstrap.ts                # Wiring manual (ordem importa)
│
├── features/
│   ├── ov-client/
│   │   ├── index.ts            # Re-export: createClient, types
│   │   ├── client.ts
│   │   └── transport.ts
│   │
│   ├── session-sync/
│   │   ├── index.ts            # Re-export: SessionSync, SessionSyncLike
│   │   └── session.ts
│   │
│   ├── auto-recall/
│   │   ├── index.ts            # Re-export: createAutoRecall, AutoRecallState
│   │   ├── auto-recall.ts
│   │   ├── recall-curator.ts
│   │   └── search-mode.ts
│   │
│   ├── tools/
│   │   ├── index.ts            # Re-export: register*Tool functions
│   │   ├── tool-def.ts         # Framework de registro de tool
│   │   ├── search.ts           # memsearch
│   │   ├── read.ts             # memread
│   │   ├── browse.ts           # membrowse
│   │   ├── commit.ts           # memcommit
│   │   ├── delete.ts           # memdelete
│   │   └── import.ts           # memimport
│   │
│   ├── commands/
│   │   ├── index.ts            # Re-export: registerCommands
│   │   ├── commands.ts         # Registro dos 6 slash commands
│   │   ├── parse-args.ts
│   │   ├── format-search.ts
│   │   └── format-browse.ts
│   │
│   └── importer/
│       ├── index.ts            # Re-export: resolveSource, uploadDirectory
│       ├── source-resolver.ts
│       └── uploader.ts
│
└── shared/
    ├── index.ts
    ├── config.ts
    ├── logger.ts
    └── notify.ts
```

### Vantagens
- **Localidade**: tudo que muda junto vive junto
- **Descoberta**: novo dev encontra funcionalidade pela pasta, não grep
- **Barriers**: dependência `commands → tools` fica visível; quebrá-la requer decisão explícita
- **Testes**: cada feature pode ter seu próprio `__tests__/` ou `tests/features/`

### Desvantagens
- Mais níveis de aninhamento (4 níveis vs 1)
- Barrel files (`index.ts`) adicionam boilerplate

---

## Opção B: Domain-Based (Vertical Slices)

Similar à Opção A, mas agrupando por domínio de negócio em vez de feature técnica:

```
src/
├── index.ts
├── bootstrap.ts
│
├── domains/
│   ├── openviking-api/         # client + transport
│   ├── session/                # session-sync + commit
│   ├── recall/                 # auto-recall + curator + search-mode
│   ├── interaction/            # tools + commands + formatters + parse-args
│   └── import/                 # source-resolver + uploader
│
└── shared/
    ├── config.ts
    ├── logger.ts
    └── notify.ts
```

### Quando usar
- Se o time pensa mais em "domínios de negócio" (session, recall, import) do que em "features técnicas" (tools vs commands)
- Se há planos de extrair `openviking-api` para um package separado

---

## Opção C: Híbrida — Flat com Convenções

Manter `src/` flat, mas adicionar prefixos nos nomes de arquivo:

```
src/
├── index.ts
├── bootstrap.ts
├── ov-client.ts
├── ov-transport.ts
├── sync-session.ts
├── recall-auto.ts
├── recall-curator.ts
├── recall-search-mode.ts
├── tool-def.ts
├── tool-search.ts
├── tool-read.ts
├── tool-browse.ts
├── tool-commit.ts
├── tool-delete.ts
├── tool-import.ts
├── cmd-register.ts
├── cmd-parse-args.ts
├── cmd-format-search.ts
├── cmd-format-browse.ts
├── import-resolver.ts
├── import-uploader.ts
├── shared-config.ts
├── shared-logger.ts
└── shared-notify.ts
```

### Quando usar
- Projeto pequeno (< 30 arquivos) onde profundidade de pastas incomoda mais que ajuda
- IDE com excelente fuzzy search (a maioria tem)

---

## Recomendação

**Adotar Opção A (Feature-Based)** pelos seguintes motivos:

1. **O projeto já tem 20 arquivos e cresce** — `tools.ts` com 11KB tende a ser splitado em breve
2. **Cada feature tem fronteira clara** — `ov-client` não depende de `commands`; `importer` não depende de `auto-recall`
3. **Testes já espelham features** — `tests/tools.test.ts`, `tests/session.test.ts`, etc. A migração natural é `tests/unit/features/tools/`
4. **Barrel files permitem refatoração interna sem quebrar imports externos**

---

## Plano de Migração (Incremental)

### Fase 1: Criar estrutura + mover shared
```
mkdir -p src/shared src/features/ov-client src/features/session-sync \
  src/features/auto-recall src/features/tools src/features/commands \
  src/features/importer

# Mover shared (sem dependências cruzadas)
mv src/config.ts src/shared/
mv src/logger.ts src/shared/
mv src/notify.ts  src/shared/
```

### Fase 2: Mover features isoladas
1. `ov-client` — `client.ts` + `transport.ts` (só depende de `shared/config`)
2. `session-sync` — `session.ts` (depende de `ov-client`)
3. `importer` — `source-resolver.ts` + `uploader.ts` (depende de `ov-client`)
4. `auto-recall` — `auto-recall.ts` + `recall-curator.ts` + `search-mode.ts` (depende de `ov-client`, `session-sync`)

### Fase 3: Mover features com dependências
5. `tools` — split `tools.ts` em arquivos por tool + `tool-def.ts`
6. `commands` — `commands.ts` + `parse-args.ts` + formatters

### Fase 4: Atualizar imports
- Rodar `tsc --noEmit` após cada fase
- Atualizar `tsconfig.json` se necessário (não deve ser)

### Fase 5: Reorganizar testes
```
tests/
├── unit/
│   ├── features/
│   │   ├── ov-client/
│   │   ├── session-sync/
│   │   ├── auto-recall/
│   │   ├── tools/
│   │   ├── commands/
│   │   └── importer/
│   └── shared/
├── integration/
│   ├── integration.test.ts
│   ├── integration-memcommit.test.ts
│   └── integration-memsearch-scope.test.ts
└── mocks.ts
```

---

## Regras de Ouro

1. **Uma feature não importa de outra feature diretamente** — sempre via `features/x/index.ts`
2. **Shared não importa de features** — se `logger.ts` precisar de contexto de feature, o contexto passa por parâmetro
3. **Barrel files são read-only** — nunca colocar lógica em `index.ts`, só re-exports
4. **Cada feature expõe o mínimo** — `SessionSyncLike` em vez de `SessionSync` se for a interface pública
5. **Testes ficam ao lado ou em `tests/unit/features/`** — nunca misturar testes de integração com unit
