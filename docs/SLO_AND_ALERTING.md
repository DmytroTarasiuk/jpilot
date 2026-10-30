# SLOs, alerts, and budgets

## Initial service objectives

These are launch targets, not measured achievements.

| Journey | SLI | Target |
| --- | --- | --- |
| Authenticated dashboard/API | Successful non-5xx requests | 99.9% over 30 days |
| Scheduled search dispatch | Enabled occurrence starts within 15 minutes | 99% over 30 days |
| Search completion | Runs reach a terminal state within 30 minutes | 99% over 30 days |
| Approval persistence | Approved/rejected decisions persist without duplicate event | 99.99% |
| Privacy export | Valid request completes within 60 seconds | 99% |
| Email summary | Opted-in delivery reaches provider within 30 minutes | 99% |

## Signals and alert thresholds

- Page immediately: tenant-isolation failure, unexpected external submission, credential exposure, destructive migration, restore failure, or sustained authenticated API 5xx above 5% for 10 minutes.
- Respond during business hours: dispatcher delay over 15 minutes, connector circuit open over one hour, privacy cleanup failure, email failure backlog, or monthly budget at/above its configured warning threshold.
- Dashboard signals: failed runs in 24 hours, overdue schedules, open connector circuits, failed deliveries, monthly runs/emails, and configured limits.
- Platform controls: configure Vercel Firewall/Observability notifications and project spend notifications. Application alerts complement but do not replace provider-side limits.

## Cost controls

Search runs and emails use UTC calendar-month counters. When hard-stop is enabled, a manual run receives HTTP 429 and a scheduled occurrence is recorded as cancelled before its schedule advances. Email deliveries are marked skipped before the provider request when the cap is exhausted. Per-platform limits, connector throttles, bounded LLM tokens, and Vercel AI Gateway budgets remain separate defense layers.

Every paid provider must have a provider-side hard budget where available. Application database counters are not billing records and can lag during an outage.
