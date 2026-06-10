# SEO Audit Studio

Multi-company SEO + GEO (Generative Engine Optimization) audit app. Sitemap discovery → polite crawl → deterministic + AI scoring → interactive report → per-audit Q&A chat → session export.

Built with Nuxt 3 (Vue 3 + Nitro), Tailwind, Zod, and file-based storage — no database.

## Quick start

```bash
cp .env.example .env       # first time only
pnpm install               # first time only
pnpm run migrate           # optional: import legacy ai_agent/outputs audits
pnpm dev                   # http://localhost:3000
```

> **Before submitting a new audit**, make sure at least one AI provider is reachable (see below). Without one, audits still complete but scoring stays deterministic-only — Trinity review, keyword tiers, and competitors stay empty.

## AI providers

The app runs a **provider chain with automatic fallback**. The order and which providers are enabled are configured in the UI at **Settings → AI provider order** (persisted to `data/settings.json`). Default order:

| Order | Provider | What it is | Config |
|---|---|---|---|
| 1 | **osaurus** | Local OpenAI-compatible inference server | `OSAURUS_API_URL` (default `:1337`), `OSAURUS_MODEL` |
| 2 | **claude_cli** | The `claude` CLI invoked directly as a subprocess | uses your Claude Code login — **no API key** |
| 3 | **cursor** | OpenAI-compatible proxy over the Cursor Agent CLI | `CURSOR_API_URL` (default `:7878`), `CURSOR_API_TOKEN` |

You only need **one** working provider. `claude_cli` is the simplest: if you're logged into Claude Code (`claude` on your `PATH`, authenticated via keychain OAuth), it works with zero extra setup.

```bash
# Verify claude_cli is usable:
echo "Reply OK" | claude -p --model sonnet --output-format text   # → OK
```

Each provider gets up to **2 retries** (3 s → 9 s exponential backoff) with a **180 s** per-attempt timeout, then falls through to the next. If every provider fails for a page, the URL is recorded in `ai_failed_urls` and the audit completes with deterministic scoring; the report shows a collapsible warning listing the failed pages. Per-page AI calls are sequential with a **300 ms** throttle.

Disable a provider via env (`OSAURUS_DISABLED=1`, `CLAUDE_CLI_DISABLED=1`, `CURSOR_API_DISABLED=1`) or by toggling it off in Settings.

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
                  │   4. AI scoring (provider chain)    │
                  │      • E-E-A-T, info gain,          │
                  │        citation readiness, etc.     │
                  │   5. Narrative                      │
                  │      • Trinity review               │
                  │      • keyword tiers                │
                  │      • competitors, top actions     │
                  │   6. Persist                        │
                  │      • report.json / crawl.json     │
                  │      • report.html (export)         │
                  └─────────────────────────────────────┘
                          │
                          ▼
              GET /api/jobs/[id]/stream  (SSE: live progress events)
```

The audit page subscribes via `EventSource` and shows a live progress stepper until the job reports `done`. Scoring weights the site overall as `seo * 0.6 + geo * 0.4`.

## Sitemap coverage

By default `max_pages = 0` — the crawler audits **every URL** the sitemap lists. Set a positive number on the form (or in the API body) to cap it. The BFS fallback (no sitemap) keeps a 50-URL safety cap regardless.

## Per-audit Q&A chat

Every audit page has a floating chat widget. The full report JSON is injected into the prompt as ground truth, so the assistant can answer things like:

- *"Which page has the weakest GEO score and why?"*
- *"Give me a Yoast-ready meta description for the homepage."*
- *"What's the single most critical fix?"*

Conversations persist to `data/companies/<slug>/audits/<audit-id>/conversation.json`.

## Storage layout

Everything lives under `data/` (gitignored; override with `DATA_DIR`):

```
data/
├── companies/<slug>/audits/<audit-id>/   # report.json, crawl.json, conversation.json, exports
├── jobs/<job-id>.json                    # job records
└── settings.json                         # AI provider order/flags, claude_cli model
```

## Migration

`pnpm run migrate` imports legacy outputs from an `ai_agent/outputs/` folder into the studio's per-company layout. Idempotent — safe to re-run. Set the source with `LEGACY_OUTPUTS_DIR`.

## Commands

```bash
pnpm dev          # dev server
pnpm build        # production build
pnpm preview      # preview the build
pnpm typecheck    # vue-tsc type check
pnpm run migrate  # legacy import
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Trinity / keywords / competitors empty after audit | No AI provider was reachable | Enable/start a provider; click **Re-run with AI** on the audit page |
| Logs show `claude_cli exit 1: Not logged in` | The `claude` CLI subprocess isn't authenticated | Run `claude` once interactively to log in; confirm `echo OK \| claude -p` works |
| `AI scoring failed for N pages` warning | Some pages timed out on every provider | Click the warning to inspect URLs; **Re-run with AI** retries just those |
| `pnpm dev` fails with `EADDRINUSE :3000` | Stale Nuxt process | `pkill -f "nuxt dev"` then re-run |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The `main` branch is protected — open a pull request; external PRs require maintainer approval before merge.

## Author

Theophilus RexDanquah — [rexdanquah.dev](https://rexdanquah.dev)

## License

[MIT](LICENSE) © [Theophilus RexDanquah](https://rexdanquah.dev)
