# Phase 5 security review

Date: 2026-10-30
Scope: repository architecture and controls through Phase 5

## Implemented

- Authenticated tenant/owner boundaries on user data, private R2 access, privacy export, and erasure.
- Security response headers including HSTS in production, clickjacking protection, MIME sniffing protection, referrer policy, and restrictive browser feature policy.
- Local tracked-file secret scanner; weekly/push/PR dependency audit; PR dependency review; CodeQL security-extended analysis.
- Monthly search/email budgets, connector rate limits and circuit breakers, retention cleanup, privacy audit history, and two-step erasure.
- Sanitized support diagnostics with time-limited grants and no impersonation.
- Restore verifier, threat model, privacy policy, SLO/alert plan, and incident response runbook.

## Open production gates

- Enable repository Secret Protection/push protection and require security checks on `main`.
- Verify Vercel WAF/Firewall alerts, spend notifications, log-drain access, and production environment separation.
- Verify private R2 posture and least-privilege credentials.
- Complete and approve a real Neon restored-branch drill.
- Complete legal review and publish controller/subprocessor/transfer disclosures.
- Run an authenticated preview E2E after migration and verify header compatibility with Clerk and Eve.
- No CSP is enforced yet. Add a nonce-based policy only after Clerk, Eve streaming, Vercel Workflow, and required assets are inventoried; a brittle wildcard policy would not be a meaningful control.

OWASP ASVS 5 is the review baseline: https://asvs.owasp.org/
