# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # deps (pnpm, not npm)
pnpm dev              # dev server at http://localhost:3000
pnpm build            # production build
pnpm typecheck        # nuxt typecheck (vue-tsc) — the only verification gate; no tests or lint config exist
pnpm run migrate      # import legacy ai_agent/outputs audits (idempotent; path via LEGACY_OUTPUTS_DIR)
```

First-time setup: `cp .env.example .env`. AI providers are optional — without one, audits complete with deterministic scoring only (Trinity / keyword tiers / competitors stay empty).

## What this is

Multi-company SEO + GEO (Generative Engine Optimization) audit app. Nuxt 3 full-stack: Vue 3 frontend + Nitro server, file-based storage (no database), Tailwind, Zod validation, strict TypeScript.

## Architecture

### Audit pipeline (the core flow)

`POST /api/audits` returns immediately with `{job_id, audit_id, company_slug}`; a background runner (`server/lib/runner/run-audit.ts`) then executes:

1. **Sitemap discovery** (`server/lib/crawler/`) — robots.txt → sitemap URLs, handles sitemap-index nesting, BFS fallback (50-URL cap) when no sitemap. `max_pages=0` means audit every sitemap URL.
2. **Polite crawl** — concurrency 4, 1.5 s per-host delay, retries with exponential backoff, cheerio extraction.
3. **Deterministic scoring** (`server/lib/scorer/deterministic.ts`) — rules-based checklist items.
4. **AI scoring** (`server/lib/scorer/claude.ts`) — AI-gated items (E-E-A-T, info gain, citation readiness). Per-page calls are sequential with a 300 ms throttle. Pages that fail all providers land in `ai_failed_urls`; audit still completes.
5. **Narrative** — Trinity review, keyword tiers, competitors, top actions.
6. **Persist** — report.json, crawl.json, report.html.

Progress streams over SSE (`GET /api/jobs/[id]/stream`); the audit page subscribes via `EventSource`. Jobs live in an in-memory queue (`server/lib/jobs/`) with disk persistence under `data/jobs/`.

### AI provider chain (`server/lib/ai/client.ts`)

Three providers tried in order, each with 2 retries (3 s → 9 s backoff) and 180 s per-attempt timeout:

1. **osaurus** — local OpenAI-compatible API (`OSAURUS_API_URL`, default :1337)
2. **claude_cli** — direct subprocess call to the `claude` CLI (model from settings, default "sonnet")
3. **cursor** — OpenAI-compatible proxy over Cursor Agent CLI (`CURSOR_API_URL`, default :7878)

Order and enabled flags are runtime-configurable via `ai_provider_order` / `ai_provider_enabled` in settings (`server/lib/storage/settings.ts`, edited at `/settings`, persisted to `data/settings.json`). Env `*_DISABLED=1` vars also disable providers. Note: README still describes the removed `claude_local_api` provider — `client.ts` is the source of truth.

Prompts live in `server/lib/ai/prompts/` (scoring, narrative, chat, company-summary).

### Scoring model

- `checklist.json` at repo root is the canonical rubric: 6 categories (technical, on_page, content, links, schema, geo), each item tagged `scoring_mode: "deterministic" | "ai"`. Served by `/api/checklist`, editable at `/settings/checklist`.
- Site aggregation (`server/lib/scorer/aggregate.ts`): `overall = seo * 0.6 + geo * 0.4`.

### Storage (file-based, `server/lib/storage/`)

Everything under `data/` (gitignored; override with `DATA_DIR`):
- `data/companies/<slug>/audits/<audit-id>/` — report.json, crawl.json, conversation.json, exports
- `data/jobs/<id>.json` — job records
- `data/settings.json` — provider order/flags, claude_cli model

All report shapes are Zod schemas in `server/lib/report/schema.ts` — change shapes there first.

### Frontend

Pages: `index.vue` (dashboard), `new.vue` (submit audit), `audits/[id].vue` (report viewer + floating Q&A chat), `companies/[slug]` (history), `reports/` (flat list), `settings/` + `settings/checklist`. Components grouped by domain: `components/report/` (gauges, bars, Trinity, keyword tiers, todo/pages tables), `components/jobs/` (progress stepper), `components/chat/` (ChatWidget). Pinia is installed but no stores are defined — state is component-local / composables.

The per-audit chat (`POST /api/audits/[id]/chat`, SSE streaming) injects the full report JSON into the prompt as ground truth; conversations persist next to the audit.

## Gotchas

- `EADDRINUSE :3000` → stale Nuxt process: `pkill -f "nuxt dev"`.
- Re-running AI scoring: `POST /api/audits/[id]/rescore` (full) or `/rescore-failed` (only `ai_failed_urls`); "Re-run with AI" button on audit page.
- README's provider/setup sections predate the `claude_local_api` removal (commit 2a56519); trust `server/lib/ai/client.ts` and `.env.example` comments may also be stale.
