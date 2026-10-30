# Privacy and data lifecycle

Status: engineering policy; legal review required before public launch.

## Data purpose and minimization

JobPilot stores confirmed candidate preferences, private CV content, search configuration, source snapshots needed to explain matching, proposals, application decisions, and operational audit records. It does not include provider secrets or R2 object keys in user exports. Global public vacancy records may be retained for deduplication, but tenant-owned snapshots, proposals, and applications follow tenant retention/deletion controls.

The application records every consent choice as an append-only event with a policy version. Withdrawal is prospective and does not rewrite earlier audit history. Processing is not silently broadened: application submission remains separately approval-gated.

## User controls

- `/privacy` exposes the current consent choice and its history.
- `/api/privacy/export` returns a non-cached, authenticated JSON export scoped by tenant and owner.
- Erasure uses an authenticated two-step flow with a 30-minute confirmation token and exact confirmation phrase.
- Erasure removes private CV objects from R2 before deleting database records. If R2 fails, the request remains failed and retryable; database records are not falsely reported as erased.
- Pseudonymous consent/request history can survive erasure for audit and abuse prevention. It contains a one-way subject hash, not a Clerk ID or email.

## Default retention

| Record | Default | Configurable range |
| --- | ---: | ---: |
| Source snapshots | 90 days | 30–365 days |
| Notifications | 180 days | 30–730 days |
| Audit events | 365 days | 365–2,555 days |

Cleanup runs through the authenticated dispatcher and is tenant-specific. CVs, profile data, schedules, applications, and active account records remain until the user deletes them because automatic expiry would undermine application history.

## Operational requests

Support must verify the authenticated user and never request a CV or credential by email. Requests that cannot be completed automatically—legal holds, shared organization ownership, or identity disputes—must enter the incident/privacy process. The launch owner must publish a controller identity, contact address, lawful bases, subprocessor list, international transfer disclosures, and jurisdiction-specific retention exceptions.

The EU Commission’s data-subject guidance describes access, erasure, and portability rights and generally expects a response within one month: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en
