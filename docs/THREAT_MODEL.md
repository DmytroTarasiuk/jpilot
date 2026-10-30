# Threat model

Status: Phase 5 baseline, 2026-10-30
Method: OWASP ASVS 5 control-oriented review

## Assets and trust boundaries

High-value assets are CV originals and extracted text, profile facts, job/application history, approval decisions, provider credential references, Clerk identity mappings, and operational secrets. Trust boundaries exist between the browser and Next.js, Clerk and the application, Vercel functions/workflows and Neon, functions and private R2, connector adapters and job boards, Eve and application tools, and GitHub Actions and the cron endpoint.

## Primary threats and controls

| Threat | Current controls | Residual risk / release action |
| --- | --- | --- |
| Cross-tenant object access | Every user-owned query requires tenant and owner IDs; private download URLs are issued only after that check; integration tests exercise hostile IDs. | Keep isolation tests required in CI and review every new table for ownership fields. |
| CV disclosure | Private R2 bucket, short-lived signed URLs, no storage keys in export, no CV contents in support diagnostics. | Verify bucket public access is disabled and token is least privilege before launch. |
| Credential leakage | Environment-only secrets, opaque provider references, tracked-file scanner, dependency/CodeQL workflows. | Enable GitHub Secret Protection/push protection in repository settings; rotate any value ever exposed. |
| Unauthorized application submission | Per-job approval, append-only transition log, idempotent attempt ledger, no browser-automation fallback. | No live direct-submit adapter is enabled; provider approval remains a launch gate. |
| Prompt/tool injection | Eve receives tenant-projected context and typed tools; credentials never enter model context; deterministic matching is primary. | Add adversarial tool-loop evals before adding tools that perform external writes. |
| Scheduler replay or duplicate side effects | Bearer-authenticated cron, DB leases, run idempotency keys, provider attempt idempotency. | Rotate `CRON_SECRET` and monitor 401/5xx rates. |
| Resource/cost exhaustion | Per-source rate limits/circuit breakers, per-platform caps, monthly run/email hard limits, bounded LLM use. | Add Vercel project spend notifications and provider-side budgets before paid launch. |
| Erasure abuse | Authenticated two-step, short-lived random token, explicit phrase, owner/tenant scoping, R2 cleanup before DB removal. | Clerk session remains managed by Clerk; users should sign out after erasure. Document any legal retention exception. |
| Dependency compromise | Frozen lockfile, weekly production audit, PR dependency review, CodeQL. | Require the checks on protected `main`; investigate high/critical findings before release. |
| Log privacy leakage | Structured failure codes and sanitized support diagnostics; no secrets in audit metadata. | Production log-drain access and retention must be configured and reviewed. |

## Security logging

Authentication is enforced at the routing boundary. Sensitive actions—support access, integration changes, CV changes, export, and governance changes—write tenant-scoped audit records without secrets. Authorization failures return non-enumerating responses. Production alerting must cover repeated authentication failures, dispatcher 401/5xx responses, open connector circuits, budget warnings, and erasure cleanup failures.

## Explicit exclusions

JobPilot does not treat a website login as permission to automate it. CAPTCHA bypass, stealth browsing, scraping behind access controls, credential sharing with Eve, and unapproved submission endpoints are outside the system design.
