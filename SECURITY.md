# Security policy

## Reporting a vulnerability

Do not open a public issue. Send a private report to the repository owner with the affected route or component, impact, reproducible steps, and any safe proof. Do not include real CVs, credentials, access tokens, or third-party personal data.

We acknowledge complete reports within two business days and provide a remediation status within seven business days. Critical credential exposure is handled immediately: revoke or rotate first, then investigate and remove the exposed value from history.

## Supported version

Security fixes target the deployed `main` branch. Preview deployments and development branches are not supported production environments.

## Security invariants

- Clerk authentication and tenant ownership checks guard user routes.
- CV objects stay private in R2 and are accessed only through short-lived, owner-scoped URLs.
- External application writes require an explicit per-job approval and idempotency key.
- Platform secrets are referenced, never returned to the browser, model, diagnostics, or data export.
- JobPilot does not bypass CAPTCHAs, anti-bot controls, or unsupported provider flows.
