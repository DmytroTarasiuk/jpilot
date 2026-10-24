import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
