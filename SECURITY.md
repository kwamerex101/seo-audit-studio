# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

If you discover a security issue, report it privately so it can be addressed
before public disclosure. Choose either:

- **GitHub private advisory** (preferred): go to the repository's **Security →
  Advisories → Report a vulnerability** tab, or
- **Email**: kwamerex101@gmail.com

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected version / commit, and any relevant configuration.

You can expect an initial acknowledgement within a few days. Once the issue is
confirmed and a fix is available, a coordinated disclosure timeline will be
agreed with you.

## Scope notes

This app is designed to run **locally**: it stores audit data on the local
filesystem under `data/` and talks to local AI providers (osaurus, the
`claude` CLI, cursor-api). When deploying or exposing it beyond localhost,
keep in mind:

- The crawler issues outbound HTTP requests to user-supplied URLs — be mindful
  of SSRF exposure if the API is reachable by untrusted clients.
- The `claude_cli` provider spawns a local subprocess with your Claude Code
  credentials; only run it in a trusted environment.
- Secrets belong in `.env` (gitignored), never in committed code.

## Supported versions

This is an actively developed project without formal version branches. Fixes
land on `main`; please report against the latest commit.
