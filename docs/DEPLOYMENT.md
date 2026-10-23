# Deployment runbook

This runbook intentionally separates source readiness from live-service provisioning. Never paste secret values into Git, issue comments, logs, or an agent prompt.

## Required production choices

- **Vercel:** Pro or Enterprise. The application uses a once-per-minute dispatcher so arbitrary user-selected run minutes can be claimed promptly. Vercel Hobby supports only one cron invocation per day and hourly timing precision.
- **Clerk:** separate development and production instances, with production redirect URLs limited to the real application domains.
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

Create every key listed in `.env.example` in the appropriate Vercel environment. `CRON_SECRET` must be a cryptographically random value of at least 16 characters; longer is preferred. Vercel sends it to the dispatcher as a bearer token.

Use separate credentials for development, preview, and production. Do not expose `CLERK_SECRET_KEY`, `DATABASE_URL`, or R2 credentials through any `NEXT_PUBLIC_` variable.

## 3. Configure the private R2 bucket

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

The current upload contract signs one object key, content type, and content length for ten minutes. Finalization performs an authenticated tenant lookup and validates the stored length and content type before making the document active.

## 4. Prepare Neon safely

1. Point `DATABASE_URL` at a disposable Neon development branch.
2. Review all files under `drizzle/`.
3. Run `pnpm db:migrate` against that development branch only.
4. Run the app and exercise identity creation, tenant isolation, CV upload, schedule creation, and duplicate-request behavior.
5. Promote the reviewed migration through the normal release process; never let a preview deployment migrate production automatically.

## 5. Preview verification

Verify these flows with two unrelated Clerk users and, if organizations are enabled, two organizations:

- public landing and sign-in/sign-up;
- protected-page redirect while signed out;
- no cross-tenant read, mutation, CV finalization, or Eve session access;
- PDF and DOCX upload, wrong content type, wrong size, expired URL, and oversized upload;
- daily and weekly schedules around DST boundaries;
- duplicate schedule request IDs and duplicate dispatcher invocations;
- invalid and missing `CRON_SECRET`;
- workflow retry/replay without duplicate run ownership;
- schedules remain paused when no discovery integration is connected.

## 6. Production release gate

Before promotion, add observability and alerts for dispatcher authorization failures, overdue schedules, workflow failures, connector degradation, R2 upload errors, and tenant-authorization denials. Confirm backup/restore, data retention/deletion, incident response, and connector terms before enabling real candidate traffic.

## References

- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Securing Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel durable execution model](https://vercel.com/blog/a-new-programming-model-for-durable-execution)
- [Clerk Next.js authentication](https://clerk.com/docs/reference/nextjs/app-router/auth)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 browser CORS](https://developers.cloudflare.com/r2/buckets/cors/)
