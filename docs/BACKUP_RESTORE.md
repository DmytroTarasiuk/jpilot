# Neon backup and restore runbook

## Objective

Prove that a recent, isolated Neon restore can serve the required JobPilot schema without orphaned tenant memberships. Never perform a drill against the primary endpoint.

## Quarterly drill

1. Record the incident/drill owner, primary branch, target restore timestamp, and recovery objectives.
2. In Neon, restore to a new isolated branch using the required point in history. Do not replace the production endpoint during a drill.
3. Create a read-only connection string for the restored branch and set it only as `RESTORE_DATABASE_URL` in the local shell or protected CI environment.
4. Keep the current primary URL in `DATABASE_URL`; the verifier refuses identical targets.
5. Run `pnpm restore:verify`. It checks migration history, required Phase 5 tables, and tenant membership referential integrity without writing data.
6. Run a preview deployment against the restored branch and verify sign-in, dashboard reads, one owner-scoped export, and a read-only application timeline. Do not send email, dispatch workflows, or submit applications.
7. Record restore point, start/end times, achieved RPO/RTO, verifier output, smoke-test result, and any data gap.
8. Delete the isolated branch and revoke its temporary credential after evidence is stored.

## Emergency recovery

Freeze external writes and dispatcher invocations, preserve evidence, identify the last known-good instant, restore into a branch, run the verifier and smoke tests, then use Neon’s documented endpoint/branch recovery procedure. Announce the maintenance window before any endpoint swap. Rotate credentials if compromise is possible.

Neon documents point-in-time restore and branch-based recovery; plan limits and available history must be verified in the production Neon project before launch: https://neon.com/blog/announcing-point-in-time-restore

## Acceptance record

The Phase 5 code and verifier are complete, but the production-readiness gate remains open until a real restored branch is tested and evidence is approved.
