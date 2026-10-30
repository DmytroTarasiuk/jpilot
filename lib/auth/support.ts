import { createHash, timingSafeEqual } from "node:crypto";
import { getSupportAccessEnvironment } from "../env/server";

export function isAuthorizedSupportRequest(request: Request) {
  const environment = getSupportAccessEnvironment();
  if (!environment) return false;
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!provided) return false;
  const expectedHash = createHash("sha256").update(environment.SUPPORT_ACCESS_SECRET).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}
