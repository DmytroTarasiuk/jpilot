import { createClerkClient } from "@clerk/backend";
import type { AuthFn } from "eve/channels/auth";
import { ForbiddenError } from "eve/channels/auth";
import { claimAgentSession, ensureTenantIdentity } from "../db/tenancy";

export function clerkAppAuth(): AuthFn<Request> {
  return async (request) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!secretKey || !publishableKey) return null;

    const requestState = await createClerkClient({ secretKey, publishableKey }).authenticateRequest(
      request,
      { acceptsToken: "session_token" },
    );
    if (!requestState.isAuthenticated) return null;

    const clerk = requestState.toAuth();
    if (!clerk.userId) return null;
    const identity = await ensureTenantIdentity({
      clerkUserId: clerk.userId,
      clerkOrganizationId: clerk.orgId ?? null,
      clerkOrganizationRole: clerk.orgRole ?? null,
    });

    const sessionId = sessionIdFromRequest(request);
    if (
      sessionId &&
      !(await claimAgentSession({
        sessionId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      }))
    ) {
      throw new ForbiddenError({
        message: "This agent session does not belong to the authenticated user.",
      });
    }

    const issuer =
      typeof clerk.sessionClaims.iss === "string" ? clerk.sessionClaims.iss : "https://clerk.com";
    return {
      authenticator: "clerk",
      issuer,
      principalId: clerk.userId,
      principalType: "user",
      subject: clerk.userId,
      attributes: {
        tenantId: identity.tenantId,
        appUserId: identity.userId,
        role: identity.role,
      },
    };
  };
}

function sessionIdFromRequest(request: Request) {
  const match = new URL(request.url).pathname.match(/\/eve\/v1\/session\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
