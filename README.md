# SEO Audit Studio

Multi-company SEO + GEO audit app. Sitemap discovery → crawl → Claude-assisted scoring → interactive report → Q&A chat → session export.

Plan: `~/.claude/plans/lets-review-the-seo-warm-dream.md`.

## Phase 1 (this commit)

- Nuxt 3 + TypeScript + Tailwind scaffold.
- Canonical SEO + GEO checklist at `checklist.json` (35 items, sourced from `ai_agent/seo_engine/scoring_rubric.md`).
- Zod schemas that mirror the existing Python audit JSON byte-for-byte — migration is lossless.
- File-based storage under `data/companies/<slug>/audits/<audit-id>/`.
- Migration script pulls the existing Sitenna (2026-03-11) and Blackmeister Consulting reports out of `ai_agent/outputs/`.
- Minimal dashboard + company page + audit viewer stub.

Phases 2–7 (crawler, scoring, narrative, interactive viewer, jobs, Q&A chat, session export) ship in subsequent commits.

## Setup

```bash
cd /Users/rexdanquah/Projects/seo-audit-studio
cp .env.example .env    # fill in ANTHROPIC_API_KEY later; LEGACY_OUTPUTS_DIR already defaults correctly
pnpm install
pnpm run migrate        # imports Sitenna + Blackmeister from ai_agent/outputs
pnpm dev                # open http://localhost:3000
```

The migration is idempotent — safe to re-run.

## Layout

```
seo-audit-studio/
├── pages/                # Nuxt pages (dashboard, company, audit, new)
├── server/
│   ├── api/              # /api/companies, /api/audits, /api/migrate
│   └── lib/
│       ├── report/schema.ts     # Zod schemas
│       ├── storage/             # file-based persistence
│       └── migrate/             # legacy outputs importer
├── scripts/migrate.ts    # CLI entry for `pnpm run migrate`
├── checklist.json        # canonical SEO + GEO checklist
├── data/                 # gitignored; per-company audit artifacts
└── layouts/ components/ assets/  # UI
```

## Verifying Phase 1

1. `pnpm install && pnpm run migrate` — should print `imported=2 skipped=0` on first run, `skipped=2` on the second.
2. `pnpm dev` → http://localhost:3000 — Sitenna and Blackmeister Consulting appear with their overall / SEO / GEO score pills.
3. Click a company → see its audit history. Click an audit → see overall scores + top actions (full interactive view lands in Phase 4).
# seo-audit-studio
