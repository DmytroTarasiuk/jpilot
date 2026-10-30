# Incident response runbook

## Severity

- **SEV-1:** cross-tenant exposure, unauthorized application submission, live credential disclosure, destructive data loss, or primary service outage.
- **SEV-2:** sustained workflow/dispatcher failure, privacy request failure, restore degradation, or material provider outage.
- **SEV-3:** isolated connector/email failure with a safe manual path.

## Response

1. Acknowledge, assign incident commander and scribe, state severity, and preserve timestamps/request IDs.
2. Contain: pause affected schedules/connectors, revoke support grants, rotate exposed credentials, or disable the affected route. Do not destroy evidence.
3. Assess tenant scope from owner-scoped records and audit events. Never copy CV text or secrets into chat/tickets.
4. Recover with idempotent retries or the backup/restore runbook. Validate tenant isolation before re-enabling writes.
5. Communicate confirmed facts, impact window, workaround, and next update time. Legal/privacy owners decide notification obligations.
6. Close only after metrics normalize, queued work is reconciled, and external side effects are accounted for.
7. Publish a blameless review with root cause, contributing controls, remediation owner/date, and test or monitor preventing recurrence.

## Provider-specific containment

- Clerk: revoke sessions/keys and validate redirect/origin configuration.
- Neon: rotate role credentials, inspect branches/endpoints, freeze migrations.
- R2: rotate least-privilege token and verify bucket public access remains disabled.
- Vercel: rotate environment secrets, inspect deployment/function/firewall logs, pause cron if needed.
- AI Gateway/model provider: disable the route or budget, review request metadata, and confirm no credential or CV leakage.
- Job boards/email: disable only the affected adapter/channel; preserve manual tasks and receipts.
