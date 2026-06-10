# Contributing to SEO Audit Studio

Thanks for your interest in contributing! This guide covers setup, the branch
workflow, and what's expected before a pull request can merge.

## Prerequisites

- **Node.js** 18+ (the repo targets `@types/node` 22)
- **pnpm** (the project uses pnpm; `npm`/`yarn` lockfiles will be rejected)
- At least one working AI provider if you're touching scoring — see the
  [AI providers](README.md#ai-providers) section. `claude_cli` is the
  zero-config option if you're logged into Claude Code.

## Setup

```bash
git clone https://github.com/kwamerex101/seo-audit-studio.git
cd seo-audit-studio
cp .env.example .env
pnpm install
pnpm dev          # http://localhost:3000
```

## Branch & PR workflow

The `main` branch is protected:

- **No direct pushes** for contributors — all changes go through a pull request.
- Every PR requires **maintainer approval** before it can merge.
- Force pushes and branch deletion on `main` are blocked, and open
  conversations must be resolved before merge.

Steps:

1. Branch from `main` using a descriptive name: `fix/...`, `feat/...`, or
   `docs/...`.
2. Make your change. Keep PRs focused — one logical change per PR.
3. Run the checks below and make sure they're clean.
4. Open a PR against `main` with a clear title and a body describing **what**
   changed and **why**. Fill in the PR template.
5. Address review feedback; a maintainer merges once approved.

## Before you open a PR

```bash
pnpm typecheck    # vue-tsc — must not introduce new type errors
pnpm build        # must succeed
```

There is currently **no automated test suite**. If you add one, wire it into
this section and the PR template. For scoring or crawler changes, manually run
an audit end-to-end and confirm the report populates.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/): `fix:`,
`feat:`, `docs:`, `refactor:`, `chore:`. Explain the *why* in the body when it
isn't obvious from the subject.

## Code conventions

- TypeScript is `strict`. No `any` escapes without justification.
- Match the surrounding style — Vue 3 `<script setup>`, Nitro server routes
  under `server/api/`, Zod schemas in `server/lib/report/schema.ts`.
- Never commit secrets, `.env`, or anything under `data/` (all gitignored).

## Reporting bugs & requesting features

Use the [issue templates](.github/ISSUE_TEMPLATE/). For security issues, do
**not** open a public issue — see [SECURITY.md](SECURITY.md).
