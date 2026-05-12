# SEO Audit Studio

Multi-company SEO + GEO (Generative Engine Optimization) audit app. Sitemap discovery → polite crawl → deterministic + AI scoring → interactive report → per-audit Q&A chat → session export.

Plan: `~/.claude/plans/lets-review-the-seo-warm-dream.md`.

## Quick start

```bash
cd /Users/rexdanquah/Projects/seo-audit-studio
cp .env.example .env       # first time only
pnpm install               # first time only
pnpm run migrate           # imports legacy Sitenna + Blackmeister audits
pnpm dev                   # http://localhost:3000
```

> **Before you submit a new audit**, make sure at least one AI provider is running (see [Running the AI providers](#running-the-ai-providers) below). Without one, audits will still complete but scoring stays deterministic-only and Trinity / keyword tiers / competitors stay empty.

## Running the AI providers

The app uses a **two-provider chain** with automatic fallback. Pick one or both — having both gives you graceful failover.

### 1. Primary: `claude_local_api` (recommended)

Wraps your Claude Code CLI subscription. **No API key required.**

```bash
cd /Users/rexdanquah/Projects/claude_local_api
./start.sh                 # listens on :8765
```

Verify: `curl http://localhost:8765/health` → `{"status":"ok", ...}`.

### 2. Fallback: `cursor-api`

Wraps the Cursor Agent CLI with an OpenAI-compatible endpoint. Used automatically when `claude_local_api` times out, errors, or is unreachable.

```bash
cd /Users/rexdanquah/Projects/cursor-api
npm install                # first time only
npm run dev                # listens on :7878
```

Verify: `curl http://localhost:7878/healthz` → `{"status":"ok", ...}`.

### Provider chain & retries

| Step | Behavior |
|---|---|
| 1 | Try `claude_local_api` with up to **2 retries** (3 s → 9 s exponential backoff) and a **180 s** per-attempt timeout. |
| 2 | If exhausted, fall through to `cursor-api` with the same retry policy. |
| 3 | If both fail for a page, the URL is added to `ai_failed_urls` and the audit completes with deterministic scoring. The UI shows a collapsible warning listing each failed page. |
| 4 | Per-page AI calls are sequential with a **300 ms** throttle between pages so the local Claude CLI subprocess isn't slammed. |

You can disable a provider explicitly:

```bash
# In .env
CLAUDE_LOCAL_DISABLED=1
CURSOR_API_DISABLED=1
```

## Verifying the setup

```bash
# 1. Confirm providers
curl http://localhost:8765/health | jq .status     # claude_local_api → "ok"
curl http://localhost:7878/healthz | jq .status    # cursor-api       → "ok"

# 2. Run a small audit
curl -s -X POST -H "content-type: application/json" \
  -d '{"url":"https://www.blackmeisterconsulting.com","max_pages":3}' \
  http://localhost:3000/api/audits

# 3. Watch progress (replace <job_id> from the response above)
curl -s http://localhost:3000/api/jobs/<job_id> | jq '.step, .pct, .message'
```

A successful audit log will pass through every step: `queued → sitemap → crawl → score_deterministic → score_claude → narrative → persist → done`.

## Project layout

```
seo-audit-studio/
├── pages/                # Nuxt pages
│   ├── index.vue         # dashboard
│   ├── reports/          # flat list across all companies
│   ├── companies/[slug]  # company audit history
│   ├── audits/[id]       # report viewer + Q&A chat
│   └── new.vue           # submit a new audit
├── components/
│   ├── report/           # gauges, bars, Trinity, keyword tiers, GEO, todo, pages table
│   ├── jobs/             # JobProgress stepper
│   └── chat/             # ChatWidget (floating bottom-right)
├── server/
│   ├── api/              # /companies, /audits, /jobs, /audits/[id]/chat
│   ├── middleware/       # icon-stub (silences favicon 404s)
│   └── lib/
│       ├── crawler/      # sitemap discovery, polite fetch, cheerio extractor
│       ├── scorer/       # deterministic + Claude scoring + 60/40 aggregation
│       ├── ai/           # claude_local_api + cursor-api unified client
│       ├── jobs/         # in-memory queue + SSE progress
│       ├── runner/       # audit orchestrator
│       ├── storage/      # file-based per-company storage
│       ├── migrate/      # legacy outputs/ importer
│       └── report/       # Zod schemas
├── checklist.json        # canonical SEO + GEO checklist (35 items, 6 categories)
├── data/                 # gitignored — per-company audits + jobs + conversations
└── scripts/migrate.ts    # CLI: pnpm run migrate
```

## How an audit works

```
POST /api/audits  →  {job_id, audit_id, company_slug}      (returns immediately)
                          │
                          ▼
                  ┌─────────────────────────────────────┐
                  │ Background runner                   │
                  │   1. Sitemap discovery              │
                  │      • robots.txt → sitemap URLs    │
                  │      • parses sitemap-index nesting │
                  │      • BFS fallback if no sitemap   │
                  │   2. Polite crawl                   │
                  │      • concurrency 4                │
                  │      • 1.5 s delay per host         │
                  │      • retry w/ exp backoff         │
                  │   3. Deterministic scoring          │
                  │      • all rules-based items        │
                  │   4. AI scoring (Claude)            │
                  │      • E-E-A-T, info gain,          │
                  │        citation readiness, etc.     │
                  │      • retries → cursor-api         │
                  │   5. Narrative                      │
                  │      • Trinity review               │
                  │      • keyword tiers                │
                  │      • real competitors             │
                  │      • top actions                  │
                  │   6. Persist                        │
                  │      • report.json                  │
                  │      • crawl.json                   │
                  │      • report.html (export)         │
                  └─────────────────────────────────────┘
                          │
                          ▼
              GET /api/jobs/[id]/stream  (SSE: live progress events)
```

The runner emits SSE events at every step. The audit page subscribes via `EventSource` and shows a live progress stepper until the job reports `done`.

## Sitemap coverage

By default `max_pages = 0`, which means the crawler audits **every URL** the sitemap lists. Set a positive number on the form (or in the API body) to cap the audit. The BFS fallback (when no sitemap exists) keeps a 50-URL safety cap regardless.

## Per-audit Q&A chat

Every audit page has a floating chat widget bottom-right. The full report JSON is included in the prompt as ground truth — Claude can answer questions like:

- *"Which page has the weakest GEO score and why?"*
- *"Give me a Yoast-ready meta description for the homepage."*
- *"What's the single most critical fix?"*

Conversations persist to `data/companies/<slug>/audits/<audit-id>/conversation.json`.

## Migration

`pnpm run migrate` imports legacy outputs from `ai_agent/outputs/` (Sitenna + Blackmeister) into the studio's per-company folder layout. Idempotent — safe to re-run.

Override the path with `LEGACY_OUTPUTS_DIR=/some/other/path`.

## Daily workflow checklist

```
[ ] cd /Users/rexdanquah/Projects/claude_local_api && ./start.sh   # primary AI
[ ] cd /Users/rexdanquah/Projects/cursor-api && npm run dev        # fallback AI (optional)
[ ] cd /Users/rexdanquah/Projects/seo-audit-studio && pnpm dev     # studio at :3000
[ ] open http://localhost:3000
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Audit finishes but Trinity / keywords / competitors are empty | No AI provider was reachable | Start `claude_local_api` (or `cursor-api`); click **Re-run with AI** on the audit page |
| `[ai] claude_local_api exhausted, falling back to cursor-api` | Claude CLI is slow or stuck | Normal — fallback handles it. If you see this often, restart claude_local_api |
| `AI scoring failed for N pages` warning on the report | A few pages timed out on both providers | Click the warning to inspect the URLs; **Re-run with AI** to retry just those |
| Vue Router warnings about `/apple-touch-icon.png` | Browser auto-requesting icon | Already handled — Nitro middleware returns 204. Reload the dev server if you still see them |
| `pnpm dev` fails with `EADDRINUSE :3000` | Stale Nuxt process | `pkill -f "nuxt dev"` then re-run `pnpm dev` |

## Phases shipped

- **Phase 1** — skeleton + Zod schema + migration of legacy reports
- **Phase 2** — TypeScript crawler + deterministic scoring (60/40 SEO/GEO)
- **Phase 3** — AI scoring + narrative via `claude_local_api`
- **Phase 4** — interactive report viewer (gauges, bars, Trinity, todo table, pages table with drilldown)
- **Phase 5** — background jobs + SSE progress stepper
- **Phase 6** — per-audit Q&A chat with streaming
- **Provider fallback chain** — `cursor-api` as backup, retries with exp backoff, per-page failure tracking
- **UX polish** — count-up gauges, animated bars, table fade-in, card hover, chat slide animations

Phase 7 (TO-DO toggling + session export to MD/HTML) is the next milestone.
