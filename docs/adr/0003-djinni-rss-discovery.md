# ADR 0003: Djinni first-party RSS discovery

Status: accepted  
Reviewed: 2026-10-25

## Decision

Phase 2 uses Djinni's public, first-party RSS feed as JobPilot's first discovery adapter. Djinni links the feed from its public jobs page and carries the current search filters into the feed URL.

JobPilot uses only these country-filtered endpoints:

- `https://djinni.co/jobs/rss/?country=POL`
- `https://djinni.co/jobs/rss/?country=UKR`

References:

- <https://djinni.co/jobs/?country=POL>
- <https://djinni.co/jobs/?country=UKR>
- <https://djinni.co/terms/>

## Capability and authentication

- Capability: discover only.
- Authentication: none (`public_rss`).
- Prepare, submit, and track: unsupported.
- JobPilot does not automate Djinni's authenticated UI, messaging, or application flow and does not crawl vacancy detail pages.

Users explicitly connect the RSS integration in JobPilot. Only then can a schedule containing Djinni become runnable.

## Operational bounds

Djinni does not publish a dedicated RSS rate-limit contract. The adapter therefore makes at most one feed request per selected country per run, honors the schedule's per-platform result limit, uses a 12-second timeout, rejects responses above 2 MiB, and performs no more than two Workflow retries after the initial attempt. HTTP 408, 429, and 5xx responses are retryable; other HTTP failures and invalid configuration are permanent for that workflow attempt.

## Data limitations

The RSS item provides a title, URL/GUID, description, publication date, and categories. It does not provide reliable structured company, city, salary, or work-mode fields. JobPilot therefore:

- derives the stable external ID from the Djinni vacancy URL;
- assigns country from the first-party country filter;
- keeps employer as `Undisclosed` unless the title explicitly identifies it;
- infers work mode only from vacancy text;
- records concerns when employer, work mode, or salary cannot be verified;
- persists the exact source payload and normalized payload for every run.

These limitations are visible in match explanations and are never filled by an LLM. The adapter and compliance basis must be reviewed again before production launch if Djinni changes its feed or terms.
