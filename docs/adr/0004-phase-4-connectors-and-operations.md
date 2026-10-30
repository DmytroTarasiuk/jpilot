# ADR 0004: Phase 4 connectors and operations

Status: accepted
Reviewed: 2026-10-30

## Decision

Phase 4 adds DOU discovery through the first-party public RSS feed at `https://jobs.dou.ua/vacancies/feeds/`. DOU and Djinni advertise discover/prepare/track capabilities only; every application still follows the reviewed manual path. JobPilot does not crawl vacancy detail pages, automate an authenticated UI, or infer missing vacancy countries.

LinkedIn, Just Join IT, and No Fluff Jobs remain visible but disabled. At review time:

- LinkedIn's documented Talent Solutions APIs require approved partner access and are designed for ATS/employer integrations, not a general applicant-side discovery/submission bot.
- no documented public applicant discovery/submission API or first-party feed was verified for Just Join IT or No Fluff Jobs;
- absence of a verified route is treated as unsupported, not permission to use a private website endpoint.

References:

- <https://jobs.dou.ua/>
- <https://jobs.dou.ua/vacancies/feeds/>
- <https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access>
- <https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/create-apply-connect-jobs>
- <https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf?nocache=>

## DOU data boundary

The adapter reads title, link/GUID, description, and publication date from RSS, canonicalizes `jobs.dou.ua` vacancy URLs, and derives the external ID only from `/vacancies/{id}`. It recognizes explicit Polish and Ukrainian locations plus remote roles on the Ukraine-focused feed. Recognizable third-country locations are counted as `rejectedUnsupportedCountry`; they are not silently assigned to Poland or Ukraine. The complete source payload and the deterministic normalized record are persisted with per-run diagnostics.

## Connector isolation and recovery

Connector runtime state is global per source so concurrent Vercel instances share one request interval and circuit. A source becomes degraded after a retrieval failure and opens after three consecutive retrieval failures. The cooldown starts at five minutes and increases to a one-hour cap. A successful half-open request resets the circuit. Workflow retries remain bounded, one source failure is caught and reported without discarding other source work, and database/idempotency constraints make replay safe.

## Notifications and support

Every finalized run creates one tenant-scoped in-app summary. Connector failures create one actionable alert per run/source. Users may opt into email only at their verified Clerk primary address; the same notification is queued once and sent through Resend with a stable provider idempotency key when deployment secrets are present.

Workspace owners/admins can grant a named support principal `diagnostics:read` for at most 72 hours and revoke it early. The support endpoint also requires a server secret, returns counters and connector/run health only, and audits every successful read. It exposes no CV text, vacancy payload, application draft, secret, mutation, or impersonation capability.
