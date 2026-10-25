# ADR 0002: Application automation safety

- Status: accepted
- Date: 2026-10-23

## Decision

Default every employment application to human approval. Permit future unattended submission only when all of the following are true:

1. the user enabled a narrow standing policy;
2. the job satisfies that policy using verified structured facts;
3. the connector supports a permitted direct-submit path;
4. the CV and answers contain no model-invented candidate claims;
5. the idempotency key has not been consumed;
6. the platform limit and user daily limit have capacity.

External application sites, CAPTCHAs, ambiguous questions, missing required facts, and publication dates that cannot be verified always create a manual task.

## Why

Employment actions can materially affect the user. Human approval, tenant authorization, and replay protection solve different problems and all remain necessary. Platform restrictions also change independently of our code, so connector capability must be explicit and revocable.

## Consequences

- The agent may recommend and prepare, but the policy engine decides whether submission can run.
- Approval responses are tenant- and requester-authorized.
- Scheduled runs never wait inside an unattended agent turn; they create persisted approval tasks.
- Each connector has a kill switch and can be downgraded from submit to prepare/manual without a deployment.

## Phase 3 implementation boundary

JobPilot now materializes each new proposal as a tenant-owned application with a pending approval, a deterministic draft, and append-only events. Approving a Djinni role creates a manual task and never a submission claim. The initial draft uses only confirmed profile fields and records the CV that was active when the proposal was created; user edits are explicitly recorded as user-confirmed content.

The direct-submit interface requires provider-side idempotency and stores a safe receipt in a durable attempt ledger. Its registry is intentionally empty. LinkedIn's documented Apply Connect and Easy Apply integrations are partner/ATS-side products rather than a general applicant-side submission API, and no documented applicant-side submit API was identified for the other initial platforms. Registering a live adapter therefore requires a separate capability and terms review. Browser automation is not an acceptable substitute.

References:

- https://learn.microsoft.com/en-gb/linkedin/talent/easy-apply
- https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/create-configure-customer-application

