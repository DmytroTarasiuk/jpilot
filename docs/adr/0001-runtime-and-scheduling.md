# ADR 0001: Runtime and scheduling architecture

- Status: accepted
- Date: 2026-10-23

## Decision

Use one Next.js deployment enhanced by Eve, Clerk for identity, Neon Postgres for application state, private Cloudflare R2 for CVs, Vercel Cron for a lightweight dispatcher, and Vercel Workflow for each durable search run.

Store user schedules in Neon and dispatch them through atomic leases. Do not use Eve experimental dynamic schedules as the primary scheduler.

## Why

- The product requires arbitrary per-user times, timezones, catch-up, quotas, and auditability.
- PostgreSQL leasing gives deterministic ownership when multiple dispatcher invocations overlap.
- Vercel Workflow provides durable step retries while Neon remains the system of record.
- Eve dynamic schedules currently depend on an organization feature flag and are not available in every preview/self-hosted context.
- A single Next.js plus Eve deployment avoids a second public service boundary in the first release.

## Consequences

- The dispatcher must implement atomic lease acquisition and expired-lease recovery.
- Delivery is at least once; every workflow and external side effect requires an idempotency key.
- Schedule advancement occurs only after terminal run bookkeeping.
- Worker concurrency and per-platform limits are enforced from the database, not process memory.

