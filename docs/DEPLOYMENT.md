# Deployment runbook

This runbook intentionally separates source readiness from live-service provisioning. Never paste secret values into Git, issue comments, logs, or an agent prompt.

## Required production choices

- **Vercel:** Hobby is supported for prelaunch validation. Its daily Vercel Cron is retained as a recovery safety-net, while the repository's GitHub Actions workflow invokes the same idempotent dispatcher every five minutes. Move the dispatcher to a once-per-minute Vercel Cron when the project upgrades to Pro or Enterprise.
- **Clerk:** the development instance may be used during prelaunch validation. Before accepting real users, replace it with a production instance and limit redirect URLs to the real application domains.
- **Neon:** separate development/preview and production branches. Use a pooled connection string for the application.
- **Cloudflare R2:** a private bucket, a least-privilege object read/write token, and browser CORS restricted to exact application origins.

## 1. Link Vercel before running the app

From the repository root, link or create the Vercel project. Keep the project root at the repository root and use:

- install command: `pnpm install --frozen-lockfile`
- build command: `pnpm build`
- Node.js: `24.x`
- Fluid compute: enabled

Do not run the development server or a database migration until the environment inventory is complete.

## 2. Configure secrets

Create every key listed in `.env.example` in the appropriate Vercel environment. `CRON_SECRET` must be a cryptographically random value of at least 16 characters; longer is preferred. Vercel and the external dispatcher send it to the endpoint as a bearer token.

In-app notifications require no provider. Optional email delivery uses Resend's HTTPS API: set `RESEND_API_KEY` to a sending-only key and `NOTIFICATION_EMAIL_FROM` to a verified sender. If either is absent, messages remain in-app and no outbound email request is made. Optional read-only support diagnostics require a separate high-entropy `SUPPORT_ACCESS_SECRET`; keep the diagnostics endpoint disabled by omitting this secret until the support process is approved.

Use separate credentials for development, preview, and production. Do not expose `CLERK_SECRET_KEY`, `DATABASE_URL`, or R2 credentials through any `NEXT_PUBLIC_` variable.

Malware scanning is opt-in during prelaunch. Set `CV_MALWARE_SCAN_ENABLED=false` (the default) to keep CV bytes inside JobPilot. In this mode, the application still validates PDF/DOCX file signatures, enforces upload and archive-expansion bounds, validates the DOCX package structure, limits PDF pages and image sizes, and bounds extracted text. These checks reject malformed or resource-abusive files, but they are not an antivirus verdict; the document is recorded as `scan_status=skipped`.

To enable antivirus scanning, set `CV_MALWARE_SCAN_ENABLED=true` and configure `CLOUDMERSIVE_API_KEY` as a Vercel Secret. JobPilot then uses Cloudmersive's advanced file scan, restricts accepted content to PDF and DOCX, and blocks executables, invalid files, scripts, password-protected documents, macros, unsafe archives, embedded objects, and other active-content threats. CV parsing fails closed when Cloudmersive is enabled but absent, unreachable, or returns an invalid response. The CV bytes are transmitted to Cloudmersive only in this mode, so reflect that processor in the product's privacy notice before enabling it.

## 3. Configure prelaunch schedule dispatch

Vercel Hobby cannot run the dispatcher more than once per day. The Vercel cron in `vercel.ts` therefore remains a daily recovery invocation, while `.github/workflows/dispatch-schedules.yml` supplies five-minute dispatch precision.

In GitHub repository settings, configure:

- Actions variable `JOBPILOT_CRON_URL` with the full endpoint, for example `https://jpilot-black.vercel.app/api/cron/dispatch`;
- Actions secret `CRON_SECRET` with exactly the same value as the Vercel `CRON_SECRET`.

The workflow can also be started manually from the Actions tab. GitHub scheduled workflows can be delayed, so this is appropriate for prelaunch/MVP use rather than a strict scheduling SLO. After upgrading to Vercel Pro, change the Vercel cron to `* * * * *`, remove or disable the GitHub schedule, and keep the same authenticated dispatcher endpoint.

## 4. Configure the private R2 bucket

Keep public bucket access disabled. Create an API token limited to the one CV bucket and only the operations required by the application.

Apply a CORS policy per environment. Replace the sample origins with exact URLs; do not use `*` in production.

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://app.example.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The current upload contract signs one object key, content type, and content length for ten minutes. Finalization performs an authenticated tenant lookup and validates the stored length and content type before starting the durable scan/parse workflow. The CV becomes active only after the user reviews and confirms the extracted profile.

## 5. Prepare Neon safely

1. Point `DATABASE_URL` at a disposable Neon development branch.
2. Review all files under `drizzle/`.
3. Run `pnpm db:migrate` against that development branch only.
4. Run the app and exercise identity creation, tenant isolation, CV upload, schedule creation, and duplicate-request behavior.
5. Promote the reviewed migration through the normal release process; never let a preview deployment migrate production automatically.

Migration `0006_dear_sway.sql` introduces Phase 3 drafts and submission-attempt records. It also materializes existing Phase 2 proposals into pending, manual approval tasks so historical proposals remain reviewable instead of being silently dropped. Validate the backfilled counts on the development branch before promotion.

Migration `0007_flowery_genesis.sql` adds shared connector health/circuit state, tenant notifications and email-delivery outbox records, notification preferences, and temporary support grants. Apply it before connecting DOU or deploying the Phase 4 UI and worker changes.

## 6. Preview verification

Verify these flows with two unrelated Clerk users and, if organizations are enabled, two organizations:

- public landing and sign-in/sign-up;
- protected-page redirect while signed out;
- no cross-tenant read, mutation, CV finalization, or Eve session access;
- PDF and DOCX upload, signature/type mismatch, wrong size, expired URL, oversized upload, built-in validation with scanning disabled, scanner failure and infected files with scanning enabled, archive expansion limits, and user confirmation;
- daily and weekly schedules around DST boundaries;
- duplicate schedule request IDs and duplicate dispatcher invocations;
- invalid and missing `CRON_SECRET`;
- workflow retry/replay without duplicate run ownership;
- proposal creation produces exactly one application, pending approval, grounded draft, and ordered timeline;
- cross-tenant application reads and decisions return no data and make no change;
- approve, reject, bulk review, manual deep link, draft edit, and user-confirmed status correction;
- repeated direct-submit workflow execution reuses one provider idempotency key and one durable receipt when a reviewed adapter is available;
- schedules remain paused when no discovery integration is connected.
- a DOU-only run persists canonical vacancies and a repeated run creates no duplicate proposal;
- one connector failure does not stop another connector, opens its circuit after the bounded threshold, and emits one actionable alert;
- run-summary replay creates one notification and at most one provider email through the stable idempotency key;
- support diagnostics reject missing, expired, revoked, wrong-tenant, or wrong-principal grants and append an audit event for every successful read.

## 7. Production release gate

Before promotion, enable Cloudmersive (or another reviewed malware-scanning provider), then add observability and alerts for dispatcher authorization failures, overdue schedules, workflow failures, scanner failures, connector degradation, R2 upload errors, and tenant-authorization denials. Confirm backup/restore, data retention/deletion, incident response, and connector terms before enabling real candidate traffic.

## References

- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Securing Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Cloudmersive Virus Scan API](https://api.cloudmersive.com/docs/virus.asp)
- [Cloudmersive Node.js client](https://github.com/Cloudmersive/Cloudmersive.APIClient.NodeJS.Virus)
- [Vercel durable execution model](https://vercel.com/blog/a-new-programming-model-for-durable-execution)
- [Clerk Next.js authentication](https://clerk.com/docs/reference/nextjs/app-router/auth)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 browser CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Resend email API](https://resend.com/docs/api-reference/emails/send-email)
