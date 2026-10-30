# Production readiness checklist

## Code gates

- [x] Tenant/owner isolation tests cover export, deletion, matching, approvals, and support diagnostics.
- [x] Privacy export, consent history, two-step erasure, and R2 cleanup are implemented.
- [x] Retention policies and monthly hard budgets are enforced.
- [x] Secret scan, dependency audit/review, CodeQL, security headers, and incident runbooks are present.
- [x] Restore verification is read-only and refuses the primary database target.
- [x] Typecheck, 55 tests, tracked-file secret scan, production dependency audit, Webpack production build, and Eve code build pass. Local Eve sandbox prewarm remains unavailable until the microsandbox VM runtime is installed.

## Deployment gates

- [x] Migration `0008` is reviewed, applied to the repository-configured Neon `jpilot` database, and verified in the migration ledger.
- [ ] Authenticated preview E2E passes across browser → API → Neon/R2 → response.
- [ ] Vercel Firewall alerts, spend notifications, and log access are configured and tested.
- [ ] GitHub Secret Protection/push protection and required security checks are enabled.
- [ ] Production R2 bucket and token posture are verified.
- [ ] Real Neon restore drill is completed and evidence records achieved RPO/RTO.
- [ ] Privacy/security/legal owners approve the published policy and incident contacts.
- [ ] No unsupported direct-submit adapter is enabled.

Phase 5 acceptance is not complete until every deployment gate is checked by an accountable owner. Repository code cannot prove external provider configuration.
