# Análise: pi-openviking vs. OpenViking Oficial

> **Nota crítica de premissa**: A descrição do usuário confunde o escopo do OpenViking. OpenViking **não é** uma ferramenta de analytics/web (captura de navegação, replay de sessões, rastreamento de eventos, performance). É uma **Context Database for AI Agents** — sistema de memória de longo prazo com paradigma de filesystem, níveis de conteúdo (L0/L1/L2), extração de memórias, e semantic search. O pi-openviking é um plugin de integração de memória/contexto para o Pi coding agent — está alinhado com o propósito real do OpenViking.

---

## 1. Funcionalidades Principais Expostas

### O que o OpenViking propõe (core features)

| Feature | Descrição Oficial | Nível |
|---------|-------------------|-------|
| Filesystem Management Paradigm | Gestão unificada de memories, resources, skills via filesystem (`viking://`) | Core |
| Tiered Context Loading (L0/L1/L2) | Abstract (~100 tokens) → Overview (~2k) → Full content (on-demand) | Core |
| Directory Recursive Retrieval | Busca hierárquica combinando diretórios + semantic search | Core |
| Visualized Retrieval Trajectory | Trajetória de recuperação observável para debug | Core |
| Automatic Session Management | Auto-compressão de sessões, extração de memórias de longo prazo | Core |
| Semantic Search (find vs search) | `find()` simples (semântico) vs `search()` complexo (context-aware com intent analysis) | Core |
| Session Lifecycle | Create → Interact → Commit (com assemble/compact no OpenClaw) | Core |
| Resource/Skill Import | Importação de URLs, arquivos, diretórios, git repos | Core |
| Multi-namespace Search | Busca paralela em `viking://user/memories` e `viking://agent/memories` | Avançado |
| Archive Expansion | Reconstrução de histórico a partir de arquivos compactados | Avançado |
| Auto-commit por threshold | Commit assíncrono quando `pending_tokens` cruza limiar | Avançado |

### O que o pi-openviking expõe

| Feature | Implementado | Como |
|---------|-------------|------|
| Semantic search | ✅ | `memsearch` tool + `/ov-search` command (find/search endpoints) |
| Content read (L0/L1/L2) | ✅ | `memread` tool (abstract/overview/read/auto) |
| Filesystem browse | ✅ | `membrowse` tool + `/ov-ls` command (ls/tree/stat) |
| Session sync | ✅ | `SessionSync` — mapeamento 1:1 Pi session ↔ OV session, streaming incremental |
| Commit (memory extraction) | ✅ | `memcommit` tool + `/ov-commit` command (fire-and-forget) |
| Auto-recall | ✅ | `before_agent_start` hook com `createAutoRecall` |
| Resource/Skill import | ✅ | `memimport` tool + `/ov-import` command (URL, file, directory zip) |
| Delete by URI | ✅ | `memdelete` tool + `/ov-delete` command |
| Recall Curator (ranking) | ✅ | Multi-factor scoring + dedup + token budget |

### Funcionalidades **NÃO** expostas (gaps significativos)

| Feature | Impacto | Recomendação |
|---------|---------|--------------|
| **Multi-namespace parallel search** | O OpenClaw plugin busca `viking://user/memories` e `viking://agent/memories` em paralelo. Nosso plugin faz busca única global. | Adicionar `target_uri` padrão para buscar ambos os namespaces ou documentar claramente que busca é global. |
| **Archive expansion (`ov_archive_expand`)** | O OpenClaw expõe tool para reconstruir mensagens de um archive. Útil quando summaries são muito grosseiros. | Adicionar `memexpand` tool ou documentar que Pi mantém histórico próprio (não precisa). |
| **Auto-commit por token threshold** | O OpenClaw faz commit assíncnico automático quando sessão cresce. Nosso plugin é manual-only. | Documentar decisão de design (Pi prefere commit explícito). Considerar opt-in auto-commit. |
| **Assemble / Compact** | O OpenClaw reconstrói histórico a partir de OV (compressed history summary + archive index). Nosso plugin não faz — Pi mantém próprio histórico. | Documentar explicitamente no CONTEXT.md: "Pi owns session history. OV does not reassemble it." |
| **Rerank server-side** | OV suporta rerank via API (THINKING mode). Nosso plugin confia no scoring do OV + curadoria local. | Documentar que não há reranking server-side — o plugin usa curadoria local multi-fator. |
| **Query plan visibility** | `search()` retorna `query_plan` e `query_results`. Nosso plugin expõe `query_plan` no JSON mas não formata para leitura. | Incluir `query_plan` formatado na saída do `memsearch` quando disponível. |
| **Skill search dedicado** | Nosso `memsearch` retorna skills mas não há tool dedicado como `ov_search` do OpenClaw. | Considerar tool `memsearch-skills` ou melhorar guidelines do `memsearch` para mencionar skills. |
| **Post-commit polling** | Nosso plugin é fire-and-forget (retorna `task_id`). Não há verificação de status de extração. | Documentar como verificar task status manualmente ou adicionar `memcommit --wait`. |

---

## 2. API — Padrões e Convenções Oficiais

### ✅ Alinhamentos

| Convenção | OpenViking Oficial | pi-openviking |
|-----------|-------------------|---------------|
| Endpoints REST | `/api/v1/search/find`, `/api/v1/search/search`, `/api/v1/content/{abstract,overview,read}`, `/api/v1/fs/{ls,tree,stat}`, `/api/v1/sessions/{id}/commit`, `/api/v1/resources`, `/api/v1/skills`, `/api/v1/resources/temp_upload` | ✅ Idênticos |
| Headers `X-OpenViking-*` | `X-OpenViking-Account`, `X-OpenViking-User` | ✅ Presentes |
| Headers auth | `X-API-Key` | ✅ Presente |
| find vs search | `find` = simples/sem sessão; `search` = context-aware/com sessão | ✅ Implementado via `resolveSearchMode` |
| L0/L1/L2 | `abstract`, `overview`, `read` | ✅ Mapeados corretamente |
| Session streaming | `POST /api/v1/sessions/{id}/messages` com `{role, content}` | ✅ Implementado |
| Directory import | Zip local + `temp_upload` + import | ✅ Implementado |
| Auto-recall como XML block | `<relevant-memories>` injetado no prompt | ✅ Implementado |
| Fire-and-forget commit | Retorna `task_id`, não poll | ✅ Implementado |

### ⚠️ Desvios ou Omissões

| Convenção | Oficial | Nosso Plugin | Nota |
|-----------|---------|-------------|------|
| `X-OpenViking-Agent` | OpenClaw envia para routing multi-agent | ❌ Ausente | Relevante se Pi suportar multi-agent no futuro |
| Tenant namespace policy | `isolateUserScopeByAgent`, `isolateAgentScopeByUser` | ❌ Não implementado | Simplificação válida para uso single-tenant |
| `search()` com `session_info` | O oficial passa objeto de sessão completo | ⚠️ Passa apenas `session_id` | O OV server aceita apenas `session_id` via POST; isso parece correto |
| `query_results` | `search()` retorna resultados por TypedQuery | ⚠️ Presente no JSON mas não formatado | Nosso plugin descarta `query_results` na formatação |
| `toolCall`/`toolResult` preservation | OpenClaw preserva tool calls no session sync | ❌ Nosso `extractText` filtra apenas `text` | **Gap real**: tool calls e thinking content são perdidos no sync |
| Image content sync | OpenClaw pode sync conteúdo não-texto? | ❌ `extractText` ignora `image`, `thinking`, `tool_call` | **Gap real**: conteúdo multimodal não chega ao OV |

---

## 3. Gaps — Proposta vs. Entrega

### Gaps de Implementação

1. **Session sync perde tool calls e thinking content**
   - `SessionSync.extractText()` filtra apenas blocos `type === "text"`. 
   - Tool calls (críticos para rastrear uso de ferramentas) e thinking content são descartados.
   - **Recomendação**: Serializar tool calls como texto estruturado no content enviado ao OV.

2. **Auto-recall não faz busca paralela user + agent**
   - OpenClaw busca `viking://user/memories` e `viking://agent/memories` em paralelo.
   - Nosso plugin faz uma busca global sem `target_uri`.
   - **Recomendação**: Ou adicionar busca paralela, ou documentar que a busca é global e confia no ranking do OV.

3. **Token budget de auto-recall é pequeno demais**
   - Padrão: 500 tokens. OpenClaw usa 2000.
   - Para coding agents com contexto denso, 500 tokens pode ser insuficiente.
   - **Recomendação**: Aumentar default para 1000-1500, ou documentar que o valor é conservador.

4. **Não há verificação de saúde do servidor**
   - OpenClaw faz precheck de disponibilidade antes de search para evitar stalls.
   - Nosso plugin tenta e falha silenciosamente.
   - **Recomendação**: Adicionar health check no bootstrap ou antes de auto-recall.

5. **`query_results` e `query_plan` não são apresentados ao agente**
   - O agente recebe JSON cru. Para queries complexas (deep mode), o plano de queries é valioso.
   - **Recomendação**: Incluir `query_plan` e `query_results` na saída formatada do `memsearch`.

### Gaps de Documentação

1. **README não menciona `autoRecall` config**
   - O README só cobre Docker setup. Não menciona `.pi/settings.json` ou env vars.
   - **Recomendação**: Documentar todas as opções de configuração.

2. **Não explica o que o plugin NÃO faz**
   - Falta seção "Out of Scope" ou "Diferenças do OpenClaw" visível no README.
   - Usuários podem esperar assemble/compact/archive-expand.
   - **Recomendação**: Adicionar seção "Diferenças do OpenClaw Plugin" no README.

3. **Não documenta como debugar**
   - OpenClaw documenta logs, console web, `ov tui`.
   - Nosso plugin loga para `~/.pi/agent/pi-openviking.log` mas não documenta.
   - **Recomendação**: Adicionar seção "Troubleshooting".

4. **Não menciona L0/L1/L2 para usuários finais**
   - O conceito de tiered loading é core do OpenViking mas não é mencionado no README.
   - **Recomendação**: Breve explicação de "níveis de conteúdo" no README.

---

## 4. Documentação — Beneficiários e Cenários

### Estado Atual

O README atual do pi-openviking é puramente técnico (Docker setup, endpoints). Não há:
- Descrição de **quem** se beneficia
- **Cenários de uso** além de "desenvolvimento local"
- Explicação do **valor** para cada persona

### O que falta documentar

| Persona | Benefício | Cenário | Onde documentar |
|---------|-----------|---------|-----------------|
| **Desenvolvedores** | Memória de longo prazo entre sessões; reutilização de contexto de projetos | Debug de produção (reconstruir contexto de bugs anteriores); onboarding em codebase | README "Why" section |
| **Product Managers** | N/A — plugin é técnico | — | Não aplicável |
| **Equipes de QA** | N/A | — | Não aplicável |
| **Analistas de Dados** | N/A | — | Não aplicável |
| **Agentes de IA (Pi)** | Acesso a skills importadas, documentação de projetos, memórias de preferências do usuário | Análise de conversão (buscar memórias de decisões anteriores); monitoramento de UX (padrões de interação identificados) | README + tool guidelines |

### Nota importante

A premissa do usuário sobre "desenvolvedores frontend, product managers, equipes de QA, analistas de dados" e cenários como "debug de produção, análise de conversão, monitoramento de UX" **não se aplicam** ao OpenViking nem ao pi-openviking. OpenViking é infraestrutura para **AI Agents**, não para analytics de produto. 

As personas corretas são:
- **Desenvolvedores de agentes de IA** (que integram Pi + OpenViking)
- **Usuários finais do Pi** (que se beneficiam indiretamente da memória persistente)
- **O próprio agente de IA** (que usa memórias para responder melhor)

Os cenários corretos são:
- **Memória persistente entre sessões** de coding
- **Reutilização de documentação** importada (resources)
- **Skills reutilizáveis** importadas para o agente
- **Auto-recall** de preferências e padrões do usuário

---

## 5. Recomendações Concretas

### A. Documentação (README.md)

1. **Reescrever README** com estrutura:
   - `# pi-openviking` — Pi extension for OpenViking context integration
   - `## What it does` — 3-4 bullets de valor
   - `## Who benefits` — desenvolvedores + agente de IA (não PMs/QA/analistas)
   - `## Features` — tabela das 6 tools + 6 commands
   - `## Configuration` — `.pi/settings.json` + env vars (tabela completa)
   - `## Content Levels` — L0/L1/L2 explicado
   - `## Differences from OpenClaw` — assemble/compact/archive-expand não implementados
   - `## Troubleshooting` — logs, health check, erros comuns

2. **Adicionar seção "Why not OpenClaw?"** ou "Design Decisions" visível:
   - Pi owns session history → no `assemble()`
   - Commit is explicit → no auto-commit threshold
   - No archive expansion → Pi maintains full branch

### B. Implementação

1. **Fix `SessionSync.extractText`**:
   ```typescript
   // Incluir tool calls e thinking no content enviado ao OV
   private serializeContent(content: ...) {
     // Concatenar text + toolCall summaries + thinking snippets
   }
   ```
   Prioridade: **Alta** — perda de contexto significativa.

2. **Expor `query_plan` no `formatSearch`**:
   ```typescript
   if (result.query_plan) {
     lines.push("\nQuery Plan:");
     lines.push(result.query_plan);
   }
   ```
   Prioridade: **Média**.

3. **Aumentar `autoRecallTokenBudget` default**:
   - Atual: 500. Proposta: 1000 (2x).
   - Ou documentar que é conservador.
   Prioridade: **Média**.

4. **Adicionar health check no bootstrap**:
   ```typescript
   // Antes de registrar tools, verificar /health
   ```
   Prioridade: **Baixa** — nice to have.

5. **Considerar multi-namespace search**:
   - Fazer duas buscas paralelas (`viking://user/memories`, `viking://agent/memories`) e merge.
   - Ou documentar decisão de busca global.
   Prioridade: **Baixa**.

### C. Contexto/Arquitetura

1. **Atualizar CONTEXT.md**:
   - Seção "Differences from OpenViking OpenClaw plugin" — o que omitimos e por quê.
   - Explicar que não há `assemble()` / `compact()` porque Pi é source of truth.

2. **UBIQUITOUS_LANGUAGE.md**:
   - Já está excelente. Adicionar nota sobre "Session" overload ser uma ambiguidade conhecida.

---

## Resumo Executivo

| Dimensão | Nota | Principais Ações |
|----------|------|------------------|
| **Funcionalidades** | 7/10 | Faltam: archive-expand, auto-commit threshold, multi-namespace search, tool-call sync |
| **API / Convenções** | 8/10 | Headers, endpoints, L0/L1/L2, find/search — todos corretos. Faltam `X-OpenViking-Agent` e health precheck |
| **Gaps** | Médios | Session sync perde tool calls; auto-recall budget baixo; query plan não formatado |
| **Documentação** | 4/10 | README é só Docker setup. Falta: config, troubleshooting, personas corretas, L0/L1/L2, diferenças do OpenClaw |

**Prioridade 1**: Corrigir README (valor imediato).
**Prioridade 2**: Fix `extractText` para preservar tool calls (qualidade de memória).
**Prioridade 3**: Documentar configurações e troubleshooting (adotabilidade).
