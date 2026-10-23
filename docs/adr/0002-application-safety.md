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

