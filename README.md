# JobPilot v2

JobPilot is a controlled job-search and application SaaS for candidates in Poland and Ukraine. It discovers recent vacancies, suppresses duplicates, prepares application materials, routes risky or external submissions to human review, and tracks every application event.

This repository is the new production-oriented implementation. The earlier Sites prototype is unchanged.

## Current state

The secure foundation is implemented locally:

- Next.js 16 dashboard and onboarding shell;
- Clerk sign-in/sign-up, protected routes, and per-user/per-organization tenant mapping;
- Neon Postgres schema and Drizzle migrations;
- private Cloudflare R2 CV upload/finalization using short-lived presigned URLs;
- daily and weekly schedule creation with IANA timezone and DST-safe search windows;
- Vercel Cron dispatcher and durable Workflow run skeleton;
- application/approval state machine with idempotency and audit-oriented records;
- tenant-bound Eve assistant sessions;
- focused unit tests and production builds.

No live job-board connector is enabled yet. Saved schedules are therefore paused by design. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for the phased delivery sequence and [the deployment guide](docs/DEPLOYMENT.md) for the environment gate.

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
lib/domain/            deterministic schedule/window/state rules
lib/storage/           private R2 signing and object verification
workflows/             durable search-run orchestration
```

## Safety contract

JobPilot uses official APIs or explicitly permitted integration paths. It does not bypass CAPTCHAs, anti-bot controls, access restrictions, or a platform's external application flow. Application submission is human-approved by default; unattended submission is a later, narrowly scoped capability that requires explicit user policy, verified candidate facts, a permitted connector, and an unused idempotency key.

## Architecture decisions

- [Runtime and scheduling](docs/adr/0001-runtime-and-scheduling.md)
- [Application automation safety](docs/adr/0002-application-safety.md)
