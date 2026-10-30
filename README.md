# JobPilot v2

JobPilot is a controlled job-search and application SaaS for candidates in Poland and Ukraine. It discovers recent vacancies, suppresses duplicates, prepares application materials, routes risky or external submissions to human review, and tracks every application event.

This repository is the new production-oriented implementation. The earlier Sites prototype is unchanged.

## Current state

The secure foundation and Phases 1–4 are implemented locally, except for live direct submission and job boards without a documented permitted integration:

- Next.js 16 dashboard and onboarding shell;
- Clerk sign-in/sign-up, protected routes, and per-user/per-organization tenant mapping;
- Neon Postgres schema and Drizzle migrations;
- private Cloudflare R2 CV upload, fail-closed malware scanning, bounded PDF/DOCX parsing, and user-confirmed activation;
- persisted candidate preferences plus daily and weekly schedule CRUD with IANA timezone previews and DST-safe search windows;
- capability-aware integration catalog, manual run queueing, and run history;
- Vercel Cron dispatcher and durable Workflow search pipeline;
- opt-in Djinni and DOU discovery through first-party public RSS feeds;
- canonical vacancy normalization, run-scoped source snapshots, global deduplication, tenant proposal suppression, and deterministic explainable scoring;
- per-run found, new, duplicate, eligible, proposed, and failed counters;
- tenant-scoped application inbox with per-job and bulk approve/reject controls;
- deterministic cover-letter drafts sourced only from the confirmed profile, anchored to the CV active at proposal time, plus user-confirmed screening answers;
- manual external-application handoff, append-only timelines, and user outcome corrections;
- an approval-gated direct-submission contract, durable Workflow boundary, attempt ledger, and receipt persistence with retry idempotency;
- application/approval state machine with idempotency and audit-oriented records;
- tenant-bound Eve assistant sessions;
- shared per-source rate limits, bounded retries, connector health/circuit breakers, and failure isolation;
- tenant-scoped in-app run summaries and connector alerts, plus an idempotent opt-in Resend email outbox;
- temporary audited read-only support diagnostics grants with no user impersonation;
- focused unit tests and production builds.

Djinni and DOU are the implemented discover-only connectors. JobPilot prepares a grounded draft and manual deep link, but does not automate authenticated job-board UIs or application forms. No live direct-submit adapter is registered: the safety and idempotency infrastructure is ready, while provider enablement remains blocked on a documented applicant-side API or permitted partnership. LinkedIn, Just Join IT, and No Fluff Jobs remain disabled rather than relying on private endpoints or browser automation. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for the phased delivery sequence and [the deployment guide](docs/DEPLOYMENT.md) for the environment gate.

## Stack

- Next.js 16 + React 19
- Eve agent runtime
- Vercel Workflow and Cron
- Clerk authentication
- Neon Postgres + Drizzle ORM
- private Cloudflare R2 object storage
- Vitest

Node.js 24 and pnpm are required.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
```

`pnpm db:migrate`, `pnpm dev`, and deployment require linked services and validated environment variables. Do not run migrations against production as the first target; use a Neon development branch and inspect the generated SQL first.

## Repository map

```text
agent/                 Eve agent, channel auth, and instructions
apps/web/              Next.js application
docs/                  plan, deployment runbook, and ADRs
drizzle/               reviewed SQL migrations
lib/auth/              authoritative identity and tenant context
lib/db/                schema, leasing, tenancy, and run persistence
lib/discovery/         compliant source adapters
lib/domain/            deterministic schedule/window/state rules
lib/storage/           private R2 signing and object verification
workflows/             durable search-run orchestration
```

## Safety contract

JobPilot uses official APIs or explicitly permitted integration paths. It does not bypass CAPTCHAs, anti-bot controls, access restrictions, or a platform's external application flow. Every current application needs per-job approval. A future unattended policy remains a separate, narrowly scoped capability that requires verified candidate facts, a permitted connector, and an unused idempotency key.

## Architecture decisions

- [Runtime and scheduling](docs/adr/0001-runtime-and-scheduling.md)
- [Application automation safety](docs/adr/0002-application-safety.md)
- [Djinni first-party RSS discovery](docs/adr/0003-djinni-rss-discovery.md)
- [Phase 4 connectors and operations](docs/adr/0004-phase-4-connectors-and-operations.md)
